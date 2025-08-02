"use strict";

const { TaskQueue } = require("../../../util/task-queue");
const crypto = require("crypto");
const _ = require("lodash/fp");
const {
  MISSING_DATA,
  INVALID_IMSI,
  NO_ACTIVE_SUBSCRIPTION,
  DAILY_REMAINING_RUN_OUT,
  SUBSCRIPTION_EXPIRED,
  MODE_NOT_ALLOWED,
  IMSI_NOT_ALLOWED,
  INVALID_SIGNATURE,
} = require("../../../util/error-codes");
const {
  transformErrorTask,
  getCurrentYearMonth,
  getDate,
} = require("../../../util/common");
const TranslateTask = require("../../../util/task");

const IMSI_REGEX = /^[0-9]{14,15}$/;
const BORDER_REGEX = /^(40101|46003|46005|46011)[0-9]{9,10}$/;

const validateRequest = (ctx, isPythonClientFlag) => {
  const { data } = ctx.request.body;
  const task = new TranslateTask(null);
  if (!_.isObject(data)) {
    return {
      error: transformErrorTask(isPythonClientFlag, task, MISSING_DATA),
    };
  }

  // @ts-ignore
  const { IMSI, mode, smsc, receiver, deviceApiPath, SMSContent } = data;
  task.setIMSI(IMSI);
  if (!IMSI_REGEX.test(IMSI)) {
    return {
      error: transformErrorTask(isPythonClientFlag, task, INVALID_IMSI),
    };
  }

  task.setMode(mode);
  task.setSMSC(smsc);
  task.setReceiver(receiver);
  task.setUser(ctx.state.user.username);
  task.setSpecifiedDevice(deviceApiPath);
  task.setSMSContent(SMSContent);

  return { task };
};

const checkSubscription = async (strapi, user, task, isPythonClientFlag) => {
  const self = await strapi.db.query("plugin::users-permissions.user").findOne({
    populate: true,
    where: { id: user.id },
  });
  const activeSubscription = self.subscriptions.find(
    (sub) => sub.state === "active",
  );

  if (!activeSubscription) {
    return {
      error: transformErrorTask(
        isPythonClientFlag,
        task,
        NO_ACTIVE_SUBSCRIPTION,
      ),
    };
  }
  if (activeSubscription.dailyRemaining < 1) {
    task.setDailyRemaining(activeSubscription.dailyRemaining);
    return {
      error: transformErrorTask(
        isPythonClientFlag,
        task,
        DAILY_REMAINING_RUN_OUT,
      ),
    };
  }
  if (
    new Date(activeSubscription.membershipExpirationDate).getTime() <
    new Date().getTime()
  ) {
    return {
      error: transformErrorTask(isPythonClientFlag, task, SUBSCRIPTION_EXPIRED),
    };
  }
  if (activeSubscription.mode !== "all") {
    if (
      ((task.isTranslateMode() || task.isSMSTranslateMode()) &&
        activeSubscription.mode !== "translate") ||
      (task.isCloudFetchMode() && activeSubscription.mode !== "cloud_fetch")
    ) {
      return {
        error: transformErrorTask(isPythonClientFlag, task, MODE_NOT_ALLOWED),
      };
    }
  }
  if (
    task.isCloudFetchMode() &&
    activeSubscription.IMSIs &&
    !activeSubscription.IMSIs.includes(task.getIMSI())
  ) {
    return {
      error: transformErrorTask(isPythonClientFlag, task, IMSI_NOT_ALLOWED),
    };
  }

  return { activeSubscription };
};

const verifySignature = (
  body,
  signature,
  privateKey,
  task,
  isPythonClientFlag,
) => {
  try {
    const signatureBuffer = Buffer.from(signature, "base64");
    const decryptedMessage = crypto
      .privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        signatureBuffer,
      )
      .toString();
    const originalMessage = JSON.stringify(body);
    if (
      originalMessage === decryptedMessage &&
      isTimestampValid(decryptedMessage)
    ) {
      strapi.log.info(`Auth signature success, task: ${JSON.stringify(task)}`);
    } else {
      return transformErrorTask(isPythonClientFlag, task, INVALID_SIGNATURE);
    }
  } catch (err) {
    return transformErrorTask(isPythonClientFlag, task, INVALID_SIGNATURE);
  }
  return null;
};

const determineOperator = async (strapi, task, activeSubscription) => {
  if (
    activeSubscription.operator &&
    (BORDER_REGEX.test(task.getIMSI()) ||
      task.getSpecifiedDevice()?.includes("border"))
  ) {
    task.setOperator(activeSubscription.operator);
  }

  if (task.getOperator() === "FOR") {
    const configData =
      await strapi.entityService.findMany("api::config.config");
    if (configData.foreignOperator) {
      task.setOperator(configData.foreignOperator);
    } else {
      task.setOperator("CMCC");
    }
  }
};

const processTask = async (strapi, task, activeSubscription, user) => {
  const globalTaskQueue = TaskQueue.getInstance();
  const cache = globalTaskQueue.getCache();

  if (task.isCloudFetchMode()) {
    const SMS = cache.get(`${task.getIMSI()}:SMS`);
    if (SMS) {
      task.setCallingNumber(
        cache.get(`${task.getIMSI()}:callingNumber`) || null,
      );
      task.addSMS(SMS);
    }
  }

  globalTaskQueue.addTask(task);

  await globalTaskQueue.waitUntilTaskDone(
    task,
    task.isTranslateMode() || task.isSMSTranslateMode() ? false : true,
  );

  if (task.isCloudFetchMode() && task.code === 0) {
    cache.del(`${task.getIMSI()}:SMS`);
  }

  let dailyRemaining = activeSubscription.dailyRemaining;
  if (task.code === 0) {
    await strapi.db.query("api::subscription.subscription").update({
      where: { id: activeSubscription.id },
      data: { dailyRemaining: activeSubscription.dailyRemaining - 1 },
    });
    dailyRemaining = activeSubscription.dailyRemaining - 1;
    recordTranslate(strapi, user, task.getMode(), task.getIMSI());
  }

  task.setDailyRemaining(dailyRemaining);
  task.setLastQueryTime(new Date().getTime());
  task.setLastSMSIndex(task.SMSData.length);

  if (task.SMSData.length > 0) {
    recordCloudFetch(strapi, user, task.getIMSI());
  }
};

const recordTranslate = async (strapi, user, mode, IMSI) => {
  const trx = await strapi.db.connection.transaction();
  try {
    const tableName = "records"; // Adjust according to the actual table name
    const yearMonth = getCurrentYearMonth();
    const recordIMSI = mode === 1 ? IMSI.slice(-8) : ""; // Extract last 8 digits of IMSI
    const selectResult = await trx(tableName)
      .where({
        user_id: user.id,
        year_month: yearMonth,
        mode: mode,
        imsi: recordIMSI,
      })
      .select("*");

    if (selectResult.length > 0) {
      await trx(tableName)
        .where({ id: selectResult[0].id })
        .update({ count: trx.raw("count + 1") });
    } else {
      await trx(tableName).insert({
        user_id: user.id,
        user_name: user.username,
        year_month: yearMonth,
        mode: mode,
        imsi: recordIMSI,
        count: 1,
      });
    }

    await trx.commit();
  } catch (error) {
    await trx.rollback();
    strapi.log.error("Error recording: ", error);
  }
};

const recordCloudFetch = async (strapi, user, IMSI) => {
  const trx = await strapi.db.connection.transaction();
  try {
    const tableName = "cloud_fetch_records"; // Adjust according to the actual table name
    const date = getDate();
    const recordIMSI = IMSI.slice(-8); // Extract last 8 digits of IMSI
    const selectResult = await trx(tableName)
      .where({
        user_id: user.id,
        date: date,
        imsi: recordIMSI,
      })
      .select("*");

    if (selectResult.length > 0) {
      // Do nothing
    } else {
      await trx(tableName).insert({
        user_id: user.id,
        user_name: user.username,
        date: date,
        imsi: recordIMSI,
      });
    }

    await trx.commit();
  } catch (error) {
    await trx.rollback();
    strapi.log.error("Error recording: ", error);
  }
};

const isTimestampValid = (decryptedMessage) => {
  const decryptedObject = JSON.parse(decryptedMessage);
  return (
    decryptedObject.timestamp &&
    Date.now() - decryptedObject.timestamp * 1000 < 5 * 60 * 1000
  );
};

module.exports = {
  validateRequest,
  checkSubscription,
  verifySignature,
  determineOperator,
  processTask,
  recordTranslate,
  recordCloudFetch,
};

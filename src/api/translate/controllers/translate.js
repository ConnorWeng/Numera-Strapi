"use strict";

const fs = require("fs");
const crypto = require("crypto");
const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const { TaskQueue } = require("../../../util/task-queue");
const TranslateTask = require("../../../util/task");
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
  transformResult,
  getCurrentYearMonth,
} = require("../../../util/common");

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
// const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;
const IMSI_REGEX = /^[0-9]{14,15}$/;
const BORDER_REGEX = /^(40101|46003|46005|46011)[0-9]{9,10}$/;

// load private key
const privateKey = fs.readFileSync("private_key.pem", "utf8");

const isTimestampValid = (decryptedMessage) => {
  const decryptedObject = JSON.parse(decryptedMessage);
  return (
    decryptedObject.timestamp &&
    Date.now() - decryptedObject.timestamp * 1000 < 5 * 60 * 1000
  );
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

module.exports = createCoreController(
  "api::translate.translate",
  ({ strapi }) => ({
    async create(ctx) {
      await this.validateQuery(ctx);

      // @ts-ignore
      const { signature, ...body } = ctx.request.body;
      const { data, clientName } = body;
      const isPythonClientFlag = clientName?.includes("Python");
      const task = new TranslateTask(null);
      if (!_.isObject(data)) {
        return transformErrorTask(isPythonClientFlag, task, MISSING_DATA);
      }

      // @ts-ignore
      const { IMSI, mode, smsc, receiver, deviceApiPath } = data;
      task.setIMSI(IMSI);
      if (!IMSI_REGEX.test(IMSI)) {
        return transformErrorTask(isPythonClientFlag, task, INVALID_IMSI);
      }

      task.setMode(mode);
      task.setSMSC(smsc);
      task.setReceiver(receiver);
      task.setUser(ctx.state.user.username);
      task.setSpecifiedDevice(deviceApiPath);

      const self = await strapi.db
        .query("plugin::users-permissions.user")
        .findOne({
          populate: true,
          where: { id: ctx.state.user.id },
        });
      const activeSubscription = self.subscriptions.find(
        (sub) => sub.state === "active",
      );
      if (!activeSubscription) {
        return transformErrorTask(
          isPythonClientFlag,
          task,
          NO_ACTIVE_SUBSCRIPTION,
        );
      }
      if (activeSubscription.dailyRemaining < 1) {
        task.setDailyRemaining(activeSubscription.dailyRemaining);
        return transformErrorTask(
          isPythonClientFlag,
          task,
          DAILY_REMAINING_RUN_OUT,
        );
      }
      if (
        new Date(activeSubscription.membershipExpirationDate).getTime() <
        new Date().getTime()
      ) {
        return transformErrorTask(
          isPythonClientFlag,
          task,
          SUBSCRIPTION_EXPIRED,
        );
      }
      if (activeSubscription.mode !== "all") {
        if (
          ((task.isTranslateMode() || task.isSMSTranslateMode()) &&
            activeSubscription.mode !== "translate") ||
          (task.isCloudFetchMode() && activeSubscription.mode !== "cloud_fetch")
        ) {
          return transformErrorTask(isPythonClientFlag, task, MODE_NOT_ALLOWED);
        }
      }
      if (
        task.isCloudFetchMode() &&
        activeSubscription.IMSIs &&
        !activeSubscription.IMSIs.includes(IMSI)
      ) {
        return transformErrorTask(isPythonClientFlag, task, IMSI_NOT_ALLOWED);
      }
      if (activeSubscription.authSignature) {
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
            strapi.log.info(
              `Auth signature success, task: ${JSON.stringify(task)}`,
            );
          } else {
            return transformErrorTask(
              isPythonClientFlag,
              task,
              INVALID_SIGNATURE,
            );
          }
        } catch (err) {
          return transformErrorTask(
            isPythonClientFlag,
            task,
            INVALID_SIGNATURE,
          );
        }
      }
      if (activeSubscription.operator && BORDER_REGEX.test(IMSI)) {
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
        recordTranslate(strapi, ctx.state.user, mode, IMSI);
      }

      task.setDailyRemaining(dailyRemaining);
      task.setLastQueryTime(new Date().getTime());
      task.setLastSMSIndex(task.SMSData.length);

      return transformResult(isPythonClientFlag, task);
    },

    async findOne(ctx) {
      const { id } = ctx.params;
      await this.validateQuery(ctx);
      const sanitizedQuery = await this.sanitizeQuery(ctx);
      const { clientName, clientVersion } = sanitizedQuery;
      // @ts-ignore
      const isPythonClientFlag = clientName?.includes("Python");

      const globalTaskQueue = TaskQueue.getInstance();
      const task = globalTaskQueue.findClosestTask(id);

      if (!task) {
        throw new strapiUtils.errors.NotFoundError("No task found");
      }

      await globalTaskQueue.waitUntilTaskUpdate(task);
      task.setLastQueryTime(new Date().getTime());
      const updatedSMS = task.SMSData.slice(task.lastSMSIndex);
      task.setLastSMSIndex(task.SMSData.length);

      if (task.isDone()) {
        globalTaskQueue.removeTask(task);
      }

      return transformResult(isPythonClientFlag, task, updatedSMS);
    },
  }),
);

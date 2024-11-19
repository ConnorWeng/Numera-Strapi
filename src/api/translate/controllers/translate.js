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
const promClient = require("prom-client");

const promCounter = new promClient.Counter({
  name: "numera_translate_requests_total",
  help: "Total number of translate requests",
  labelNames: ["code", "status", "operator"],
});

const { service } = strapi.plugin("strapi-prometheus");
const register = service("registry");
register.registerMetric(promCounter);

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
// const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;
const IMSI_REGEX = /^[0-9]{14,15}$/;
const BORDER_REGEX = /^(40101|46003|46005|46011)[0-9]{9,10}$/;

// load private key
const privateKey = fs.readFileSync("private_key.pem", "utf8");

const transformErrorTask = (isPythonClient, task, error) => {
  strapi.log.info(
    "translate error: " +
      error.errorMessage +
      ", task: " +
      JSON.stringify(task),
  );
  promCounter.inc({
    code: error.code,
    status: "error",
    operator: task.operator,
  });
  if (isPythonClient) {
    return {
      uid: task.uid,
      imsi_phone: task.callingNumber,
      sms_data: task.SMSData,
      type: task.operator === "CMCC" ? 0 : 1,
      timestamp: new Date().getTime() - task.createTime,
      imsi: task.IMSI,
      code: error.code,
      quantity: task.dailyRemaining,
      done: task.done,
    };
  } else {
    throw new strapiUtils.errors.ValidationError(error.errorMessage);
  }
};

const transformResult = (isPythonClient, task, updatedSMS) => {
  let result = task;
  promCounter.inc({
    code: task.code,
    status: task.code === 0 || task.code === 999 ? "success" : "error",
    operator: task.operator,
  });
  if (isPythonClient) {
    result = {
      uid: task.uid,
      imsi_phone: task.callingNumber,
      sms_data: updatedSMS || task.SMSData,
      type: task.operator === "CMCC" ? 0 : 1,
      timestamp: new Date().getTime() - task.createTime,
      imsi: task.IMSI,
      code: task.code,
      quantity: task.dailyRemaining,
      done: task.done,
    };
  }
  strapi.log.info(`Transformed result: ${JSON.stringify(result)}`);
  return result;
};

const isTimestampValid = (decryptedMessage) => {
  const decryptedObject = JSON.parse(decryptedMessage);
  return (
    decryptedObject.timestamp &&
    Date.now() - decryptedObject.timestamp * 1000 < 5 * 60 * 1000
  );
};

module.exports = createCoreController(
  "api::translate.translate",
  ({ strapi }) => ({
    async create(ctx) {
      await this.validateQuery(ctx);

      // @ts-ignore
      const { signature, ...body } = ctx.request.body;
      const { data, clientName, clientVersion } = body;
      const isPythonClient = clientName?.includes("Python");
      const task = new TranslateTask(null);
      if (!_.isObject(data)) {
        return transformErrorTask(isPythonClient, task, MISSING_DATA);
      }

      // @ts-ignore
      const { IMSI, mode, smsc, receiver } = data;
      task.setIMSI(IMSI);
      if (!IMSI_REGEX.test(IMSI)) {
        return transformErrorTask(isPythonClient, task, INVALID_IMSI);
      }

      task.setMode(mode);
      task.setSMSC(smsc);
      task.setReceiver(receiver);

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
        return transformErrorTask(isPythonClient, task, NO_ACTIVE_SUBSCRIPTION);
      }
      if (activeSubscription.dailyRemaining < 1) {
        task.setDailyRemaining(activeSubscription.dailyRemaining);
        return transformErrorTask(
          isPythonClient,
          task,
          DAILY_REMAINING_RUN_OUT,
        );
      }
      if (
        new Date(activeSubscription.membershipExpirationDate).getTime() <
        new Date().getTime()
      ) {
        return transformErrorTask(isPythonClient, task, SUBSCRIPTION_EXPIRED);
      }
      if (activeSubscription.mode !== "all") {
        if (
          ((task.isTranslateMode() || task.isSMSTranslateMode()) &&
            activeSubscription.mode !== "translate") ||
          (task.isCloudFetchMode() && activeSubscription.mode !== "cloud_fetch")
        ) {
          return transformErrorTask(isPythonClient, task, MODE_NOT_ALLOWED);
        }
      }
      if (
        task.isCloudFetchMode() &&
        activeSubscription.IMSIs &&
        !activeSubscription.IMSIs.includes(IMSI)
      ) {
        return transformErrorTask(isPythonClient, task, IMSI_NOT_ALLOWED);
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
            return transformErrorTask(isPythonClient, task, INVALID_SIGNATURE);
          }
        } catch (err) {
          return transformErrorTask(isPythonClient, task, INVALID_SIGNATURE);
        }
      }
      if (activeSubscription.operator && BORDER_REGEX.test(IMSI)) {
        task.setOperator(activeSubscription.operator);
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
      }

      task.setDailyRemaining(dailyRemaining);
      task.setLastQueryTime(new Date().getTime());
      task.setLastSMSIndex(task.SMSData.length);

      return transformResult(isPythonClient, task);
    },

    async findOne(ctx) {
      const { id } = ctx.params;
      await this.validateQuery(ctx);
      const sanitizedQuery = await this.sanitizeQuery(ctx);
      const { clientName, clientVersion } = sanitizedQuery;
      const isPythonClient = clientName?.includes("Python");

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

      return transformResult(isPythonClient, task, updatedSMS);
    },
  }),
);

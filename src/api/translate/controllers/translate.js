"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const TaskQueue = require("../../../util/task-queue");
const TranslateTask = require("../../../util/task");
const {
  MISSING_DATA,
  INVALID_IMSI,
  NO_ACTIVE_SUBSCRIPTION,
  DAILY_REMAINING_RUN_OUT,
  SUBSCRIPTION_EXPIRED,
  MODE_NOT_ALLOWED,
  IMSI_NOT_ALLOWED,
} = require("../../../util/error-codes");
const promClient = require("prom-client");

const promCounter = new promClient.Counter({
  name: "numera_translate_requests_total",
  help: "Total number of translate requests",
  labelNames: ["code", "status", "operator"],
});

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
// const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;
const IMSI_REGEX = /^[0-9]{14,16}$/;

const transformErrorTask = (isQuecClient, task, error) => {
  promCounter.inc({
    code: error.code,
    status: "error",
    operator: task.operator,
  });
  if (isQuecClient) {
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

const transformResult = (isQuecClient, task, updatedSMS) => {
  promCounter.inc({
    code: task.code,
    status: "success",
    operator: task.operator,
  });
  if (isQuecClient) {
    return {
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
  } else {
    return task;
  }
};

module.exports = createCoreController(
  "api::translate.translate",
  ({ strapi }) => ({
    async create(ctx) {
      await this.validateQuery(ctx);

      // @ts-ignore
      const { data, clientName, clientVersion } = ctx.request.body;
      const isQuecClient = clientName?.includes("Quec");
      const task = new TranslateTask(null);
      if (!_.isObject(data)) {
        return transformErrorTask(isQuecClient, task, MISSING_DATA);
      }

      // @ts-ignore
      const { IMSI, mode } = data;
      task.setIMSI(IMSI);
      if (!IMSI_REGEX.test(IMSI)) {
        return transformErrorTask(isQuecClient, task, INVALID_IMSI);
      }

      if (mode === 0 || mode === 1) {
        task.setMode(mode);
      }

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
        return transformErrorTask(isQuecClient, task, NO_ACTIVE_SUBSCRIPTION);
      }
      if (activeSubscription.dailyRemaining < 1) {
        task.setDailyRemaining(activeSubscription.dailyRemaining);
        return transformErrorTask(isQuecClient, task, DAILY_REMAINING_RUN_OUT);
      }
      if (
        new Date(activeSubscription.membershipExpirationDate).getTime() <
        new Date().getTime()
      ) {
        return transformErrorTask(isQuecClient, task, SUBSCRIPTION_EXPIRED);
      }
      if (activeSubscription.mode !== "all") {
        if (
          (mode === 0 && activeSubscription.mode !== "translate") ||
          (mode === 1 && activeSubscription.mode !== "cloud_fetch")
        ) {
          return transformErrorTask(isQuecClient, task, MODE_NOT_ALLOWED);
        }
      }
      if (
        mode === 1 &&
        activeSubscription.IMSIs &&
        !activeSubscription.IMSIs.includes(IMSI)
      ) {
        return transformErrorTask(isQuecClient, task, IMSI_NOT_ALLOWED);
      }

      const globalTaskQueue = TaskQueue.getInstance();
      globalTaskQueue.addTask(task);

      await globalTaskQueue.waitUntilTaskDone(
        task,
        task.mode === 0 ? false : true,
      );

      await strapi.db.query("api::subscription.subscription").update({
        where: { id: activeSubscription.id },
        data: { dailyRemaining: activeSubscription.dailyRemaining - 1 },
      });

      task.setDailyRemaining(activeSubscription.dailyRemaining - 1);

      return transformResult(isQuecClient, task);
    },

    async findOne(ctx) {
      const { id } = ctx.params;
      await this.validateQuery(ctx);
      const sanitizedQuery = await this.sanitizeQuery(ctx);
      const { clientName, clientVersion } = sanitizedQuery;
      const isQuecClient = clientName?.includes("Quec");

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

      return transformResult(isQuecClient, task, updatedSMS);
    },
  }),
);

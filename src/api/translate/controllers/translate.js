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
} = require("../../../util/error-codes");

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
// const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;
const IMSI_REGEX = /^[0-9]{14,16}$/;

const transformErrorTask = (isQuecClient, task, error) => {
  if (isQuecClient) {
    task.setError(error);
    task.setCode(error.code);
    return task;
  } else {
    throw new strapiUtils.errors.ValidationError(error.errorMessage);
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
      const IMSI = data.IMSI;
      task.setIMSI(IMSI);
      if (!IMSI_REGEX.test(IMSI)) {
        return transformErrorTask(isQuecClient, task, INVALID_IMSI);
      }

      let validationError = null;
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
        return transformErrorTask(isQuecClient, task, DAILY_REMAINING_RUN_OUT);
      }
      if (
        new Date(activeSubscription.membershipExpirationDate).getTime() <
        new Date().getTime()
      ) {
        return transformErrorTask(isQuecClient, task, SUBSCRIPTION_EXPIRED);
      }

      const globalTaskQueue = TaskQueue.getInstance();
      globalTaskQueue.addTask(task);
      await globalTaskQueue.waitUntilTaskDone(task);
      globalTaskQueue.removeTask(task);

      await strapi.db.query("api::subscription.subscription").update({
        where: { id: activeSubscription.id },
        data: { dailyRemaining: activeSubscription.dailyRemaining - 1 },
      });

      task.setDailyRemaining(activeSubscription.dailyRemaining - 1);

      return task;
    },
  }),
);

"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const TaskQueue = require("../../../util/task-queue");
const TranslateTask = require("../../../util/task");

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
// const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;
const IMSI_REGEX = /^[0-9]{14,16}$/;

const transformErrorTask = (isQuecClient, task, errorCode, errorMessage) => {
  if (isQuecClient) {
    task.setError({ errorCode, errorMessage });
    return task;
  } else {
    throw new strapiUtils.errors.ValidationError(errorMessage);
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
        return transformErrorTask(
          isQuecClient,
          task,
          400,
          "Missing 'data' payload in the request body",
        );
      }

      // @ts-ignore
      const IMSI = data.IMSI;
      task.setIMSI(IMSI);
      if (!IMSI_REGEX.test(IMSI)) {
        return transformErrorTask(isQuecClient, task, 400, "无效的IMSI");
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
        validationError = "没有生效的合同";
      }
      if (activeSubscription.dailyRemaining < 1) {
        validationError = "今日次数已用完";
      }
      if (
        new Date(activeSubscription.membershipExpirationDate).getTime() <
        new Date().getTime()
      ) {
        validationError = "合同已过期";
      }
      if (validationError) {
        return transformErrorTask(isQuecClient, task, 400, validationError);
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

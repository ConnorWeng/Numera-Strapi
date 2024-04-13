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

module.exports = createCoreController(
  "api::translate.translate",
  ({ strapi }) => ({
    async create(ctx) {
      await this.validateQuery(ctx);

      // @ts-ignore
      const { data } = ctx.request.body;
      if (!_.isObject(data)) {
        throw new strapiUtils.errors.ValidationError(
          'Missing "data" payload in the request body',
        );
      }
      // @ts-ignore
      const IMSI = data.IMSI;
      if (!IMSI_REGEX.test(IMSI)) {
        throw new strapiUtils.errors.ValidationError("无效的IMSI");
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
        throw new strapiUtils.errors.ValidationError("没有生效的合同");
      }
      if (activeSubscription.dailyRemaining < 1) {
        throw new strapiUtils.errors.ValidationError("今日次数已用完");
      }
      if (
        new Date(activeSubscription.membershipExpirationDate).getTime() <
        new Date().getTime()
      ) {
        throw new strapiUtils.errors.ValidationError("合同已过期");
      }

      const globalTaskQueue = TaskQueue.getInstance();
      const task = new TranslateTask(IMSI);
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

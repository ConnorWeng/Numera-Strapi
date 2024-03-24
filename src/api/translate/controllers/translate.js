"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const TaskQueue = require("../../../util/task-queue");
const TranslateTask = require("../../../util/task");

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;

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
        throw new strapiUtils.errors.ValidationError(
          "Invalid IMSI. IMSI should be a 14 or 15 digit number.",
        );
      }

      const globalTaskQueue = TaskQueue.getInstance();
      const task = new TranslateTask(IMSI);
      globalTaskQueue.addTask(task);
      await globalTaskQueue.waitUntilTaskDone(task);
      globalTaskQueue.removeTask(task);

      return task;
    },
  }),
);

"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const TaskQueue = require("../../../util/task-queue");
const TranslateTask = require("../../../util/task");

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

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

      const globalTaskQueue = TaskQueue.getInstance();
      const task = new TranslateTask(IMSI);
      globalTaskQueue.addTask(task);
      await globalTaskQueue.waitUntilTaskDone(task);
      globalTaskQueue.removeTask(task);

      const sanitizedEntity = await this.sanitizeOutput({ ...task }, ctx);
      return this.transformResponse(sanitizedEntity);
    },
  }),
);

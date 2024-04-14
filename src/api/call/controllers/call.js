"use strict";

const strapiUtils = require("@strapi/utils");
const TaskQueue = require("../../../util/task-queue");

/**
 * call controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::call.call", ({ strapi }) => ({
  async create(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    // @ts-ignore
    const { data } = ctx.request.body || {};

    const task = TaskQueue.getInstance().findClosestTask();
    if (!task) {
      throw new strapiUtils.errors.NotFoundError("No task found");
    }

    if (data.error) {
      task.setCode(data.error.code);
      task.setError(data.error);
    } else {
      task.setCallingNumber(data.callingNumber);
    }

    const sanitizedEntity = await this.sanitizeOutput({ ...task }, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));

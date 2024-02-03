"use strict";

/**
 * imsi controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const TaskQueue = require("../../../util/task-queue");

module.exports = createCoreController("api::imsi.imsi", ({ strapi }) => ({
  async create(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    // @ts-ignore
    const { data } = ctx.request?.body || {};
    TaskQueue.getInstance().addTask({
      ...data,
      operator: "GSM",
    });
    console.log(data);
  },
}));

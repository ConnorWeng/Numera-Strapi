"use strict";

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

    const sanitizedInputData = await this.sanitizeInput(data, ctx);
    const entity = {
      result: "success",
    };
    return entity;
  },
}));

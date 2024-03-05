"use strict";

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::translate.translate",
  ({ strapi }) => ({
    async create(ctx) {
      await this.validateQuery(ctx);
      const sanitizedQuery = await this.sanitizeQuery(ctx);

      // @ts-ignore
      const { data } = ctx.request.body || {};

      const entity = {
        result: "success",
      };
      return entity;
    },
  }),
);

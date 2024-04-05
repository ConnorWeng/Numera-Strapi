"use strict";

/**
 * subscription controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController(
  "api::subscription.subscription",
  ({ strapi }) => ({
    async find(ctx) {
      ctx.query.userId = ctx.state.user.id;
      return super.find(ctx);
    },
  }),
);

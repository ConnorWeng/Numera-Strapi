"use strict";

/**
 * subscription service
 */

const { createCoreService } = require("@strapi/strapi").factories;

module.exports = createCoreService(
  "api::subscription.subscription",
  ({ strapi }) => ({
    async find(params) {
      params.populate = "*";
      params.filters = { user: { id: params.userId } };
      return super.find(params);
    },
  }),
);

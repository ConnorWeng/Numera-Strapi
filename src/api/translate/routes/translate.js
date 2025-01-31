"use strict";

/**
 * translate router
 */

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = {
  routes: [
    {
      method: "GET",
      path: `/translates/:id`,
      handler: `translate.findOne`,
      config: {},
    },
    {
      method: "POST",
      path: `/translates`,
      handler: `translate.create`,
      config: {
        middlewares: ["global::rate-limit"],
      },
    },
    {
      method: "GET",
      path: `/translates`,
      handler: `translate.find`,
      config: {},
    },
    {
      method: "PUT",
      path: `/translates/:id`,
      handler: `translate.update`,
      config: {},
    },
    {
      method: "DELETE",
      path: `/translates/:id`,
      handler: `translate.delete`,
      config: {},
    },
  ],
};

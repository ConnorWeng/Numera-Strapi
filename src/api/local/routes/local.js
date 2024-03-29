"use strict";

/**
 * local router
 */

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/local/devices",
      handler: "local.devices",
    },
    {
      method: "POST",
      path: "/local/call",
      handler: "local.call",
    },
  ],
};

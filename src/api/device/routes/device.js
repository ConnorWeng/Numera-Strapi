"use strict";

/**
 * device router
 */

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = {
  routes: [
    {
      method: "GET",
      path: `/devices`,
      handler: `device.find`,
    },
    {
      method: "POST",
      path: "/devices",
      handler: "device.create",
    },
    {
      method: "PUT",
      path: "/devices",
      handler: "device.update",
    },
    {
      method: "DELETE",
      path: "/devices",
      handler: "device.delete",
    },
    {
      method: "GET",
      path: "/devices/upgrade",
      handler: "device.upgrade",
    },
    {
      method: "POST",
      path: "/devices/heartbeat",
      handler: "device.heartbeat",
    },
  ],
};

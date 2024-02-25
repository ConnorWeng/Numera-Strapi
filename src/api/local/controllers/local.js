"use strict";

const UDPServer = require("../../../udp/server");

/**
 * local controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::local.local", ({ strapi }) => ({
  async devices(ctx) {
    return UDPServer.getInstance().getMemoryStore();
  },
}));

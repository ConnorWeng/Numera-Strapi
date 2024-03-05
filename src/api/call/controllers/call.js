"use strict";

const UDPServer = require("../../../udp/server");

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

    // FIXME:
    const memstore = UDPServer.getInstance().getMemoryStore();
    memstore.call = {
      callingNumber: data.callingNumber,
      callingTime: data.callingTime,
    };

    const entity = {
      callingNumber: memstore.call.callingNumber,
      callingTime: memstore.call.callingTime,
      result: "success",
    };
    return entity;
  },
}));

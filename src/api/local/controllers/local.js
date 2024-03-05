"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const UDPServer = require("../../../udp/server");
const UDPClient = require("../../../udp/client");
const { makeCallMessage } = require("../../../util/message");

/**
 * local controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::local.local", ({ strapi }) => ({
  async devices(ctx) {
    return UDPServer.getInstance().getMemoryStore();
  },

  async call(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    // @ts-ignore
    const { data } = ctx.request.body;
    if (!_.isObject(data)) {
      throw new strapiUtils.errors.ValidationError(
        'Missing "data" payload in the request body',
      );
    }
    // @ts-ignore
    const IMSI = data.IMSI;
    console.log(IMSI);

    const currentTime = new Date().getTime();
    UDPClient.getInstance().send(makeCallMessage(IMSI), 9000, "localhost");
    const entity = {};

    // FIXME:
    const memstore = UDPServer.getInstance().getMemoryStore();
    let times = 0;

    while (true) {
      if (memstore.call && memstore.call.callingTime > currentTime) {
        entity.callingNumber = memstore.call.callingNumber;
        break;
      }
      if (times++ > 10) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));

"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const UDPServer = require("../../../udp/server");
const UDPClient = require("../../../udp/client");

/**
 * local controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

function tempCallData(IMSI) {
  let hexString =
    "e539b13436303032393231313632313830300030313233343536373839303132333435363738003133363336363039393635003030303030303030ea";
  let buffer = Buffer.from(hexString, "hex");
  return buffer;
}

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
    UDPClient.getInstance().send(tempCallData(IMSI), 9000, "localhost");
    const entity = {};
    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));

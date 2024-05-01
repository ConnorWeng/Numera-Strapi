"use strict";

/**
 * device controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const axios = require("axios");
const axiosInstance = axios.create();

const LASTEST_VERSION = "0.0.1";

module.exports = createCoreController("api::device.device", ({ strapi }) => ({
  async upgrade(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    const { clientVersion } = sanitizedQuery;

    return {
      upgrade: clientVersion !== LASTEST_VERSION,
      version: LASTEST_VERSION,
      url: "http://106.14.190.250/scripts/client.mpy",
    };
  },

  async create(ctx) {
    await axiosInstance.post(`http://106.14.190.250:3000/cmcc1-called`, {
      data: {},
    });
    return this.transformResponse({});
  },
}));

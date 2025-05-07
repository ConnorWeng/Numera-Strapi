"use strict";

/**
 * device controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const axios = require("axios");
const axiosInstance = axios.create();
const promClient = require("prom-client");

const promCounter = new promClient.Counter({
  name: "numera_device_heartbeats_total",
  help: "Total number of device heartbeats",
  labelNames: ["imei"],
});

let metricsRegistered = false;

const LATEST_VERSION = "0.0.8";

module.exports = createCoreController("api::device.device", ({ strapi }) => ({
  async upgrade(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    const { clientVersion } = sanitizedQuery;

    return {
      upgrade: clientVersion !== LATEST_VERSION,
      version: LATEST_VERSION,
      url: "http://106.14.190.250/scripts/client.mpy",
    };
  },

  async create(ctx) {
    await axiosInstance.post(`http://106.14.190.250:3000/cmcc1-called`, {
      data: {},
    });
    return this.transformResponse({});
  },

  async heartbeat(ctx) {
    await this.validateQuery(ctx);

    if (!metricsRegistered) {
      const { service } = strapi.plugin("strapi-prometheus");
      const register = service("registry");
      register.registerMetric(promCounter);
      metricsRegistered = true;
    }

    // @ts-ignore
    const { data } = ctx.request.body;
    const { imei } = data;

    promCounter.inc({ imei });

    return this.transformResponse({});
  },
}));

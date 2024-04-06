"use strict";

/**
 * device controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const axios = require("axios");
const axiosInstance = axios.create();

module.exports = createCoreController("api::device.device", ({ strapi }) => ({
  async update(ctx) {
    await axiosInstance.put(`http://106.14.190.250:3000/cmcc1-called`, {
      data: {},
    });
    return this.transformResponse({});
  },

  async delete(ctx) {
    await axiosInstance.delete(`http://106.14.190.250:3000/cmcc1-called`, {
      data: {},
    });
    return this.transformResponse({});
  },

  async create(ctx) {
    await axiosInstance.post(`http://106.14.190.250:3000/cmcc1-called`, {
      data: {},
    });
    return this.transformResponse({});
  },
}));

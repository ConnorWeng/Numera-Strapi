"use strict";

/**
 * cloud-fetch-record service
 */

const { createCoreService } = require("@strapi/strapi").factories;

module.exports = createCoreService(
  "api::cloud-fetch-record.cloud-fetch-record",
);

"use strict";

/**
 * detect service
 */

const { createCoreService } = require("@strapi/strapi").factories;

module.exports = createCoreService("api::detect.detect");

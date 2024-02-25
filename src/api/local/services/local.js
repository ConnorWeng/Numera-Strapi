"use strict";

/**
 * local service
 */

const { createCoreService } = require("@strapi/strapi").factories;

module.exports = createCoreService("api::local.local");

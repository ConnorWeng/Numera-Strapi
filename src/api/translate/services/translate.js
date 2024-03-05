"use strict";

/**
 * translate service
 */

const { createCoreService } = require("@strapi/strapi").factories;

module.exports = createCoreService("api::translate.translate");

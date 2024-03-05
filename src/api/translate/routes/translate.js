"use strict";

/**
 * translate router
 */

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = createCoreRouter("api::translate.translate");

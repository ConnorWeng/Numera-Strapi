"use strict";

/**
 * detect controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::detect.detect");

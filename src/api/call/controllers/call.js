'use strict';

/**
 * call controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::call.call');

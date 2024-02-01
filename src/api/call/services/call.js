'use strict';

/**
 * call service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::call.call');

'use strict';

/**
 * imsi controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::imsi.imsi', ({ strapi }) => ({
    async create(ctx) {
        await this.validateQuery(ctx);
        const sanitizedQuery = await this.sanitizeQuery(ctx);
        // @ts-ignore
        const { data } = ctx.request?.body || {};
        console.log(data);
    },
}));

"use strict";

const _ = require("lodash/fp");
const strapiUtils = require("@strapi/utils");
const UDPServer = require("../../../udp/server");
const UDPClient = require("../../../udp/client");
const { makeCallMessage, makeSMSMessage } = require("../../../util/message");
const { Task, MemTaskManager } = require("../../../udp/mem-task-manager");

/**
 * local controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const taskManager = MemTaskManager.getInstance();

module.exports = createCoreController("api::local.local", ({ strapi }) => ({
  async devices(ctx) {
    return UDPServer.getInstance().getMemoryStore();
  },

  async call(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);
    // @ts-ignore
    const { data } = ctx.request.body;
    if (!_.isObject(data)) {
      throw new strapiUtils.errors.ValidationError(
        'Missing "data" payload in the request body',
      );
    }
    // @ts-ignore
    const { IMSI, uid, operator, mode } = data;
    taskManager.addTask(new Task(IMSI, uid, operator));

    UDPClient.getInstance().send(
      mode === 2 ? makeSMSMessage(IMSI) : makeCallMessage(IMSI),
      9000,
      "localhost",
    );
    const entity = {
      IMSI: IMSI,
    };

    const sanitizedEntity = await this.sanitizeOutput(entity, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));

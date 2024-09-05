"use strict";

const strapiUtils = require("@strapi/utils");
const { TaskQueue } = require("../../../util/task-queue");

/**
 * call controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::call.call", ({ strapi }) => ({
  async create(ctx) {
    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    // @ts-ignore
    const { data } = ctx.request.body || {};

    const task = TaskQueue.getInstance().findClosestTask(
      data.uid,
      data.operator,
    );
    if (!task) {
      if (data.SMS && data.IMSI) {
        TaskQueue.getInstance().getCache().set(`${data.IMSI}:SMS`, data.SMS);
      }
      throw new strapiUtils.errors.NotFoundError("No task found");
    }

    strapi.log.info(
      `Received call data ${JSON.stringify(data)} for task ${JSON.stringify(task)}`,
    );

    if (
      data.error &&
      task.operator !== "FOR" &&
      !task.callingNumber &&
      task.SMSData.length === 0
    ) {
      task.setCode(data.error.code);
      task.setError(data.error);
    }

    if (data.callingNumber) {
      task.setCode(0);
      task.setError(null);
      if (!task.callingNumber) {
        task.setCallingNumber(data.callingNumber);
        TaskQueue.getInstance()
          .getCache()
          .set(`${task.getIMSI()}:callingNumber`, data.callingNumber);
      }
    }

    if (data.SMS) {
      task.setCode(0);
      task.setError(null);
      const duplicated = task.SMSData.filter((sms) => {
        return sms.time === data.SMS.time && sms.text === data.SMS.text;
      });
      if (duplicated.length === 0) {
        task.addSMS(data.SMS);
      }
    }

    const sanitizedEntity = await this.sanitizeOutput({ ...task }, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));

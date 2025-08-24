"use strict";

const fs = require("fs");
const strapiUtils = require("@strapi/utils");
const { TaskQueue } = require("../../../util/task-queue");
const {
  validateRequest,
  checkSubscription,
  verifySignature,
  determineOperator,
  processTask,
  recordCloudFetch,
  handleTaskFailure,
} = require("../controllers/create-helpers");
require("../../../util/error-codes");
const { transformResult } = require("../../../util/common");

/**
 * translate controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
// const IMSI_REGEX = /^4600[0,1,2,4,6,7,9][0-9]{10,11}$/;

// load private key
const privateKey = fs.readFileSync("private_key.pem", "utf8");

module.exports = createCoreController(
  "api::translate.translate",
  ({ strapi }) => ({
    async create(ctx) {
      await this.validateQuery(ctx);

      // @ts-ignore
      const { signature, ...body } = ctx.request.body;
      const { clientName } = body;
      const isPythonClientFlag = clientName?.includes("Python");

      const { task, error: validationError } = validateRequest(
        ctx,
        isPythonClientFlag,
      );
      if (validationError) {
        return validationError;
      }

      const { activeSubscription, error: subscriptionError } =
        await checkSubscription(
          strapi,
          ctx.state.user,
          task,
          isPythonClientFlag,
        );
      if (subscriptionError) {
        return subscriptionError;
      }

      if (activeSubscription.authSignature) {
        const signatureError = verifySignature(
          body,
          signature,
          privateKey,
          task,
          isPythonClientFlag,
        );
        if (signatureError) {
          return signatureError;
        }
      }

      await determineOperator(strapi, task, activeSubscription);
      await processTask(strapi, task, activeSubscription, ctx.state.user);

      handleTaskFailure(strapi, task);

      return transformResult(isPythonClientFlag, task);
    },

    async findOne(ctx) {
      const { id } = ctx.params;
      await this.validateQuery(ctx);
      const sanitizedQuery = await this.sanitizeQuery(ctx);
      const { clientName } = sanitizedQuery;
      // @ts-ignore
      const isPythonClientFlag = clientName?.includes("Python");

      const globalTaskQueue = TaskQueue.getInstance();
      const task = globalTaskQueue.findClosestTask(id);

      if (!task) {
        throw new strapiUtils.errors.NotFoundError("No task found");
      }

      await globalTaskQueue.waitUntilTaskUpdate(task);
      task.setLastQueryTime(new Date().getTime());
      const updatedSMS = task.SMSData.slice(task.lastSMSIndex);
      task.setLastSMSIndex(task.SMSData.length);

      if (task.SMSData.length > 0) {
        recordCloudFetch(strapi, ctx.state.user, task.IMSI);
      }

      if (task.isDone()) {
        globalTaskQueue.removeTask(task);
      }

      return transformResult(isPythonClientFlag, task, updatedSMS);
    },
  }),
);

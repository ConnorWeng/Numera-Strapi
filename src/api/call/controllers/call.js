"use strict";

const strapiUtils = require("@strapi/utils");
const { TaskQueue } = require("../../../util/task-queue");
const { SMS_FAILED } = require("../../../util/error-codes");

/**
 * call controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

const recentRequests = new Map(); // 存储最近的请求
let cleanupIntervalInitialized = false; // 标记是否已初始化清理定时器

module.exports = createCoreController("api::call.call", ({ strapi }) => ({
  async create(ctx) {
    // 确保清理定时器只初始化一次
    if (!cleanupIntervalInitialized) {
      setInterval(
        () => {
          const now = Date.now();
          for (const [key, timestamp] of recentRequests.entries()) {
            if (now - timestamp > 10 * 60 * 1000) {
              // 超过10分钟的记录清理掉
              recentRequests.delete(key);
            }
          }
          strapi.log.info("Cleaned up expired recentRequests entries.");
        },
        10 * 60 * 1000,
      ); // 每10分钟运行一次
      cleanupIntervalInitialized = true;
    }

    await this.validateQuery(ctx);
    const sanitizedQuery = await this.sanitizeQuery(ctx);

    // @ts-ignore
    const { data } = ctx.request.body || {};

    if (data.callingNumber) {
      const dataKeys = Object.keys(data).sort();
      const dataString = JSON.stringify({
        keys: dataKeys,
        callingNumber: data.callingNumber,
        apiPath: data.apiPath,
      });
      const now = Date.now();

      // 检查是否在1分钟内收到过相同的Data内容
      if (recentRequests.has(dataString)) {
        const lastRequestTime = recentRequests.get(dataString);
        if (now - lastRequestTime <= 60 * 1000) {
          strapi.log.info(
            `Duplicate request received within 1 minute: ${dataString}`,
          );
          return this.transformResponse({
            success: true,
            message: "Duplicate request ignored.",
          });
        }
      }

      // 更新最近请求记录
      recentRequests.set(dataString, now);
    }

    const task = TaskQueue.getInstance().findClosestTask(
      data.uid,
      data.operator,
      data.apiPath,
    );
    if ((!task || task.isDone()) && data.SMS && data.IMSI) {
      TaskQueue.getInstance().getCache().set(`${data.IMSI}:SMS`, data.SMS);
    }

    if (!task) {
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
    } else if (task.isSMSTranslateMode()) {
      if (data.cause !== undefined) {
        task.setCallingNumber(data.receiver);
        task.setCode(data.cause);
        task.setError(
          data.cause == 0
            ? null
            : Object.assign({ code: data.cause }, SMS_FAILED),
        );
      }
    } else {
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
    }

    const sanitizedEntity = await this.sanitizeOutput({ ...task }, ctx);
    return this.transformResponse(sanitizedEntity);
  },
}));

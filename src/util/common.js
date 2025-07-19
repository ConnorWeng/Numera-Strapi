const promClient = require("prom-client");
const strapiUtils = require("@strapi/utils");

let metricRegistered = false;

const promCounter = new promClient.Counter({
  name: "numera_translate_requests_total",
  help: "Total number of translate requests",
  labelNames: ["code", "status", "operator"],
});

const registerMetric = () => {
  if (!metricRegistered) {
    const { service } = strapi.plugin("strapi-prometheus");
    const register = service("registry");
    register.registerMetric(promCounter);
    metricRegistered = true;
  }
};

const transformErrorTask = (isPythonClient, task, error) => {
  strapi.log.info(
    "translate error: " +
      error.errorMessage +
      ", task: " +
      JSON.stringify(task),
  );
  registerMetric();
  promCounter.inc({
    code: error.code,
    status: "error",
    operator: task.operator,
  });
  if (isPythonClient) {
    return {
      uid: task.uid,
      imsi_phone: task.callingNumber,
      sms_data: task.SMSData,
      type: task.operator === "CMCC" ? 0 : 1,
      timestamp: new Date().getTime() - task.createTime,
      imsi: task.IMSI,
      code: error.code,
      quantity: task.dailyRemaining,
      done: task.done,
    };
  } else {
    throw new strapiUtils.errors.ValidationError(error.errorMessage);
  }
};

const transformResult = (isPythonClient, task, updatedSMS) => {
  let result = task;
  registerMetric();
  promCounter.inc({
    code: task.code,
    status: task.code === 0 || task.code === 999 ? "success" : "error",
    operator: task.operator,
  });
  if (isPythonClient) {
    result = {
      uid: task.uid,
      imsi_phone: task.callingNumber,
      sms_data: updatedSMS || task.SMSData,
      type: task.operator === "CMCC" ? 0 : 1,
      timestamp: new Date().getTime() - task.createTime,
      imsi: task.IMSI,
      code: task.code,
      quantity: task.dailyRemaining,
      done: task.done,
    };
  }
  strapi.log.info(`Transformed result: ${JSON.stringify(result)}`);
  return result;
};

const getCurrentYearMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0"); // getMonth() 返回 0-11，需要加 1
  return `${year}${month}`;
};

const getDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}${month}${day}`;
};

// 添加邮件记录存储
const emailHistory = new Map();
const DUPLICATE_TIME_WINDOW = 30 * 60 * 1000; // 30分钟，单位毫秒
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1小时，单位毫秒

// 清理过期的邮件记录
const cleanupEmailHistory = () => {
  const now = Date.now();
  for (const [key, record] of emailHistory.entries()) {
    if (now - record.time >= DUPLICATE_TIME_WINDOW) {
      emailHistory.delete(key);
      strapi.log.debug(`Cleaned up email record: ${key}`);
    }
  }
};

// 设置定时清理
let cleanupIntervalId = null;
const startEmailCleanup = () => {
  if (cleanupIntervalId) {
    return;
  }
  cleanupIntervalId = setInterval(cleanupEmailHistory, CLEANUP_INTERVAL);
  strapi.log.info("Started email history cleanup service.");
};

const sendNotifyEmail = async (subject, text) => {
  const key = `${subject}:${text}`;
  const now = Date.now();
  const lastRecord = emailHistory.get(key);

  // 检查是否在30分钟内有重复邮件
  if (lastRecord && now - lastRecord.time < DUPLICATE_TIME_WINDOW) {
    strapi.log.info(
      `Duplicate email suppressed - Subject: ${subject}, Text: ${text}`,
    );
    return;
  }

  // 发送邮件并记录
  await strapi.plugins["email"].services.email.send({
    to: "8063140@qq.com; foamtea30@126.com",
    from: "iamnotman88@126.com",
    subject,
    text,
  });

  // 更新记录
  emailHistory.set(key, {
    time: now,
    count: (lastRecord?.count || 0) + 1,
  });
};

module.exports = {
  transformErrorTask,
  transformResult,
  registerMetric,
  getCurrentYearMonth,
  getDate,
  sendNotifyEmail,
  startEmailCleanup,
};

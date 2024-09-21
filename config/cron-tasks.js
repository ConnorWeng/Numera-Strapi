const { TaskQueue } = require("../src/util/task-queue");
const TranslateTask = require("../src/util/task");

const sendNotifyEmail = async (subject, text) => {
  await strapi.plugins["email"].services.email.send({
    to: "8063140@qq.com; foamtea30@126.com",
    from: "iamnotman88@126.com",
    subject,
    text,
  });
};

const detectDevice = async (strapi, operator, IMSI) => {
  const taskQueue = TaskQueue.getInstance();
  if (taskQueue.remainTasks(operator) === 0) {
    strapi.log.info(`Start detecting ${operator}...`);
    const task = new TranslateTask(null);
    task.setIMSI(IMSI);
    taskQueue.addTask(task);
    await taskQueue.waitUntilTaskDone(task);
    if (task.code === 0) {
      strapi.log.info(`${operator} detected success`);
      sendNotifyEmail(
        `${operator} detected success`,
        `${operator} detected success`,
      );
    } else {
      strapi.log.info(`${operator} detected failed`);
      sendNotifyEmail(`${operator} detected failed`, JSON.stringify(task));
    }
  } else {
    strapi.log.info(`${operator} is busy, skip...`);
    sendNotifyEmail(
      `${operator} is busy, skip...`,
      `${operator} is busy, skip...`,
    );
  }
};

module.exports = {
  "0 0 0 * * *": async ({ strapi }) => {
    await strapi.db.connection.raw(
      "update subscriptions set daily_remaining = daily_quota;",
    );
  },
  "0 0 * * * *": async ({ strapi }) => {
    await detectDevice(strapi, "CMCC", "460006353179440");
    await detectDevice(strapi, "CUCC", "460013263064892");
  },
};

const UDPClient = require("./client");
const { makeCallMessage, makeSMSMessage } = require("../util/message");
const { TASK_TIMEOUT } = require("../util/task-queue");

const UNTOUCHED_TASK_TIME = 15 * 1000;

function findLastMatch(array, predicate) {
  return array.reduce((acc, item, index) => {
    return predicate(item, index, array) ? item : acc;
  }, null);
}

class Task {
  constructor(IMSI, uid, operator, mode) {
    this.uid = uid;
    this.IMSI = IMSI;
    this.operator = operator;
    this.mode = mode;
    this.createdAt = new Date().getTime();
    this.calledAt = null;
    this.retriedTimes = 0;
    this.logs = [];
    this.touchedAt = new Date().getTime();
    this.error = null;
    this.SMS = null;
  }

  getIMSI() {
    return this.IMSI;
  }

  getCreatedAt() {
    return this.createdAt;
  }

  getTouchedAt() {
    return this.touchedAt;
  }

  getCalledAt() {
    return this.calledAt;
  }

  appendLog(log) {
    this.logs.push(log);
  }

  getLogs() {
    return this.logs;
  }

  getLog() {
    return this.logs.join("\n");
  }

  getRetriedTimes() {
    return this.retriedTimes;
  }

  increaseRetry() {
    this.retriedTimes++;
  }

  touch() {
    this.touchedAt = new Date().getTime();
  }

  setError(error) {
    this.error = error;
  }

  setSMS(SMS) {
    this.SMS = SMS;
  }

  updateCalledAt() {
    this.calledAt = new Date().getTime();
  }

  isCloudFetchMode() {
    return this.mode === 1;
  }

  isSMSTranslateMode() {
    return this.mode === 2;
  }
}

class MemTaskManager {
  static instance;

  constructor() {
    if (MemTaskManager.instance) {
      return MemTaskManager.instance;
    }

    this.tasks = [];
    setInterval(() => {
      const expiredTasks = this.tasks.filter(
        (task) =>
          new Date().getTime() -
            (task.isCloudFetchMode() && task.getCalledAt()
              ? task.getCalledAt()
              : task.getCreatedAt()) >
          TASK_TIMEOUT[task.operator],
      );
      for (const expiredTask of expiredTasks) {
        this.removeTask(expiredTask);
      }
      if (expiredTasks.length > 0) {
        strapi.log.info(
          `Expired ${expiredTasks.length} tasks, now ${this.tasks.length} tasks remain`,
        );
      }

      const notTouchedTasks = this.tasks.filter(
        (task) =>
          new Date().getTime() - task.getTouchedAt() > UNTOUCHED_TASK_TIME,
      );
      for (const notTouchedTask of notTouchedTasks) {
        strapi.log.info(
          `Task ${JSON.stringify(notTouchedTask)} untouched for ${UNTOUCHED_TASK_TIME / 1000}s`,
        );
        notTouchedTask.touch();
        if (notTouchedTask.getRetriedTimes() < 2) {
          notTouchedTask.increaseRetry();
          strapi.log.info(`Retring task: ${JSON.stringify(notTouchedTask)}`);
          UDPClient.getInstance().send(
            notTouchedTask.isSMSTranslateMode()
              ? makeSMSMessage(notTouchedTask.getIMSI())
              : makeCallMessage(notTouchedTask.getIMSI()),
            9000,
            "localhost",
          );
        }
      }
    }, 1000);

    MemTaskManager.instance = this;
  }

  addTask(task) {
    this.tasks.push(task);
  }

  removeTask(task) {
    const index = this.tasks.indexOf(task);
    if (index !== -1) {
      this.tasks.splice(index, 1);
    }
  }

  getTask(IMSI) {
    return findLastMatch(this.tasks, (task) => task.getIMSI() === IMSI);
  }

  static getInstance() {
    if (!MemTaskManager.instance) {
      MemTaskManager.instance = new MemTaskManager();
    }
    return MemTaskManager.instance;
  }
}

module.exports = { Task, MemTaskManager };

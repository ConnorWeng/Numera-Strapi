const UDPClient = require("./client");
const { makeCallMessage } = require("../util/message");

const INVALID_TASK_TIME = 80 * 1000;
const UNTOUCHED_TASK_TIME = 15 * 1000;

function findLastMatch(array, predicate) {
  return array.reduce((acc, item, index) => {
    return predicate(item, index, array) ? item : acc;
  }, null);
}

class Task {
  constructor(IMSI, uid, operator) {
    this.uid = uid;
    this.IMSI = IMSI;
    this.operator = this.operator;
    this.createdAt = new Date().getTime();
    this.retriedTimes = 0;
    this.logs = [];
    this.touched = false;
    this.error = null;
    this.SMS = null;
  }

  getIMSI() {
    return this.IMSI;
  }

  getCreatedAt() {
    return this.createdAt;
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

  getTouched() {
    return this.touched;
  }

  increaseRetry() {
    this.retriedTimes++;
  }

  setTouched() {
    this.touched = true;
  }

  setError(error) {
    this.error = error;
  }

  setSMS(SMS) {
    this.SMS = SMS;
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
          new Date().getTime() - task.getCreatedAt() > INVALID_TASK_TIME,
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
          !task.getTouched() &&
          new Date().getTime() - task.getCreatedAt() > UNTOUCHED_TASK_TIME,
      );
      for (const notTouchedTask of notTouchedTasks) {
        strapi.log.info(
          `Task ${JSON.stringify(notTouchedTask)} untouched for ${UNTOUCHED_TASK_TIME / 1000}s, retrying...`,
        );
        notTouchedTask.setTouched();
        UDPClient.getInstance().send(
          makeCallMessage(notTouchedTask.getIMSI()),
          9000,
          "localhost",
        );
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

const NodeCache = require("node-cache");
const { TIMEOUT } = require("./error-codes");

const TASK_TIMEOUT = {
  CMCC: 68 * 1000,
  CUCC: 78 * 1000,
  FOR: 78 * 1000,
  BORDER: 68 * 1000,
};
const INVALID_TASK_TIME = 5 * 1000;
const CLOUD_FETCH_ADVANCE_TIME = 10 * 1000;

class TaskQueue {
  static instance;

  constructor() {
    if (TaskQueue.instance) {
      return TaskQueue.instance;
    }

    this.queue = [];
    this.cache = new NodeCache({ stdTTL: 3600 });

    TaskQueue.instance = this;

    if (process.env.IS_DEVICE === "false" || !process.env.IS_DEVICE) {
      setInterval(() => {
        const timeoutTasks = this.queue.filter((task) => task.isTimeout());
        for (const timeoutTask of timeoutTasks) {
          timeoutTask.setCode(TIMEOUT.code);
          timeoutTask.setError(TIMEOUT);
          timeoutTask.isDone();
        }
        if (timeoutTasks.length > 0) {
          strapi.log.info(
            `Timeout ${timeoutTasks.length} tasks, now ${this.queue.length} tasks remain`,
          );
        }

        const expiredTasks = this.queue.filter(
          (task) =>
            new Date().getTime() - task.getCreateTime() >
            TASK_TIMEOUT[task.operator] * 5,
        );
        for (const expiredTask of expiredTasks) {
          this.removeTask(expiredTask);
        }
        if (expiredTasks.length > 0) {
          strapi.log.info(
            `Expire ${expiredTasks.length} tasks, now ${this.queue.length} tasks remain`,
          );
        }
      }, 1000);
    }
  }

  addTask(task) {
    this.queue.push(task);
  }

  fetchAvailableTasks() {
    return this.queue.filter((task) => !task.isTaken() && !task.isDone());
  }

  removeTask(task) {
    const index = this.queue.findIndex((t) => t.createTime === task.createTime);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
  }

  findClosestTask(uid, operator, apiPath) {
    let findArray;
    if (uid) {
      findArray = this.queue.filter((task) => task.getUID() === uid);
    } else {
      findArray = this.queue.filter((task) => {
        if (
          (task.operator === operator || task.operator === "FOR") &&
          !task.isDone() &&
          !task.isTimeout() &&
          task.isTaken() &&
          (!apiPath || task.device.subdevice.apiPath === apiPath) &&
          new Date().getTime() - task.takenTime > INVALID_TASK_TIME
        ) {
          return true;
        } else {
          return false;
        }
      });
    }
    if (findArray.length > 0) {
      strapi.log.info(
        `Found task by ${uid ? "uid" : "create time"}: ${JSON.stringify(findArray[0])}.`,
      );
      return findArray[0];
    } else {
      return null;
    }
  }

  async waitUntilTaskDone(task, allowPartialDone = false) {
    return new Promise((resolve) => {
      let times = 0;
      const interval = setInterval(() => {
        times += 1;
        if (times > TASK_TIMEOUT[task.operator]) {
          task.setCode(TIMEOUT.code);
          task.setError(TIMEOUT);
        }
        if (allowPartialDone ? task.isPartialDone() : task.isDone()) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }

  async waitUntilTaskUpdate(task) {
    return new Promise((resolve) => {
      let times = 0;
      const interval = setInterval(() => {
        times += 1;
        if (times > TASK_TIMEOUT[task.operator]) {
          task.setCode(TIMEOUT.code);
          task.setError(TIMEOUT);
        }
        if (task.lastUpdateTime > task.lastQueryTime || task.isDone()) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }

  getCache() {
    return this.cache;
  }

  remainTasks(operator) {
    if (operator) {
      return this.queue.filter(
        (task) => task.operator === operator && !task.isDone(),
      ).length;
    } else {
      return this.queue.filter((task) => !task.isDone()).length;
    }
  }

  static getInstance() {
    if (!TaskQueue.instance) {
      TaskQueue.instance = new TaskQueue();
    }
    return TaskQueue.instance;
  }
}

module.exports = { TASK_TIMEOUT, CLOUD_FETCH_ADVANCE_TIME, TaskQueue };

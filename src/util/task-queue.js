const { TIMEOUT } = require("./error-codes");

const TASK_TIMEOUT = 70;
const INVALID_TASK_TIME = 4;

class TaskQueue {
  static instance;

  constructor() {
    if (TaskQueue.instance) {
      return TaskQueue.instance;
    }

    this.queue = [];
    TaskQueue.instance = this;

    if (process.env.IS_DEVICE === "false" || !process.env.IS_DEVICE) {
      setInterval(() => {
        const timeoutTasks = this.queue.filter(
          (task) =>
            !task.isDone() &&
            new Date().getTime() - task.getCreateTime() > TASK_TIMEOUT * 1000,
        );
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
            TASK_TIMEOUT * 5 * 1000,
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

  getTask() {
    for (let i = 0; i < this.queue.length; i++) {
      if (!this.queue[i].isTaken()) {
        return this.queue[i];
      }
    }
    return null;
  }

  removeTask(task) {
    const index = this.queue.findIndex((t) => t.createTime === task.createTime);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
  }

  findClosestTask(uid) {
    let findArray;
    if (uid) {
      findArray = this.queue.filter((task) => task.getUID() === uid);
    } else {
      findArray = this.queue.filter((task) => {
        if (
          !task.isDone() &&
          new Date().getTime() - task.getCreateTime() < TASK_TIMEOUT * 1000 &&
          new Date().getTime() - task.getCreateTime() > INVALID_TASK_TIME * 1000
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
        if (times > TASK_TIMEOUT) {
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
        if (times > TASK_TIMEOUT) {
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

  static getInstance() {
    if (!TaskQueue.instance) {
      TaskQueue.instance = new TaskQueue();
    }
    return TaskQueue.instance;
  }
}

module.exports = TaskQueue;

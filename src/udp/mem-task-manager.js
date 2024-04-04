const INVALID_TASK_TIME = 60 * 1000;

function findLastMatch(array, predicate) {
  return array.reduce((acc, item, index) => {
    return predicate(item, index, array) ? item : acc;
  }, null);
}

class Task {
  constructor(IMSI) {
    this.IMSI = IMSI;
    this.createdAt = new Date().getTime();
    this.retriedTimes = 0;
    this.logs = [];
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

  getLog() {
    return this.logs.join("\n");
  }

  getRetriedTimes() {
    return this.retriedTimes;
  }

  increaseRetry() {
    this.retriedTimes++;
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

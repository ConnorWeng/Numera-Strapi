const INVALID_TASK_TIME = 40 * 1000;

class Task {
  constructor(IMSI) {
    this.IMSI = IMSI;
    this.createdAt = new Date().getTime();
    this.retriedTimes = 0;
    this.logs = [];
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
  constructor() {
    this.tasks = [];
    setInterval(() => {
      const expiredTasks = this.tasks.filter(
        (task) => new Date().getTime() - task.createdAt > INVALID_TASK_TIME,
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
    strapi.log.info(
      `find ${IMSI} with time: ${new Date().getTime()} in ${JSON.stringify(this.tasks)}`,
    );
    return this.tasks.find(
      (task) =>
        task.IMSI === IMSI &&
        new Date().getTime() - task.createAt < INVALID_TASK_TIME,
    );
  }
}

module.exports = { Task, MemTaskManager };

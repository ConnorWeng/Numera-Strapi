const TASK_TIMEOUT = 20;
const INVALID_TASK_TIME = 4;

class TaskQueue {
  static instance;

  constructor() {
    if (TaskQueue.instance) {
      return TaskQueue.instance;
    }

    this.queue = [];
    TaskQueue.instance = this;
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

  findClosestTask() {
    const findArray = this.queue.filter((task) => {
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
    if (findArray.length > 0) {
      return findArray[0];
    } else {
      return null;
    }
  }

  async waitUntilTaskDone(task) {
    return new Promise((resolve) => {
      let times = 0;
      const interval = setInterval(() => {
        times += 1;
        if (task.isDone() || times > TASK_TIMEOUT) {
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

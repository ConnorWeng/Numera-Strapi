const UDPClient = require("./client");
const { makeCallMessage, makeSMSMessage } = require("../util/message");
const { TASK_TIMEOUT } = require("../util/task-queue");

const UNTOUCHED_TASK_TIME = 20 * 1000;

function findLastMatch(array, predicate) {
  return array.reduce((acc, item, index) => {
    return predicate(item, index, array) ? item : acc;
  }, null);
}

class Task {
  constructor(
    IMSI,
    uid,
    operator,
    mode,
    boardSN,
    smsc = null,
    receiver = null,
    SMSContent = null,
  ) {
    this.uid = uid;
    this.IMSI = IMSI;
    this.operator = operator;
    this.mode = mode;
    this.createdAt = new Date().getTime();
    this.calledAt = null;
    this.retriedTimes = 0;
    this.logs = [];
    this.touched = false;
    this.error = null;
    this.SMS = null;
    this.boardSN = boardSN;
    this.smsc = smsc;
    this.receiver = receiver;
    this.SMSContent = SMSContent;
  }

  getIMSI() {
    return this.IMSI;
  }

  getBoardSN() {
    return this.boardSN;
  }

  getCreatedAt() {
    return this.createdAt;
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

  getTouched() {
    return this.touched;
  }

  getSMSC() {
    return this.smsc;
  }

  getReceiver() {
    return this.receiver;
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

  setSMSContent(content) {
    this.SMSContent = content;
  }

  getSMSContent() {
    return this.SMSContent;
  }

  updateCalledAt() {
    this.calledAt = new Date().getTime();
  }

  isTranslateMode() {
    return this.mode === 0;
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
          !task.getTouched() &&
          new Date().getTime() - task.getCreatedAt() > UNTOUCHED_TASK_TIME,
      );
      for (const notTouchedTask of notTouchedTasks) {
        strapi.log.info(
          `Task ${JSON.stringify(notTouchedTask)} untouched for ${UNTOUCHED_TASK_TIME / 1000}s, retrying...`,
        );
        notTouchedTask.setTouched();
        notTouchedTask.increaseRetry();
        UDPClient.getInstance().send(
          notTouchedTask.isSMSTranslateMode()
            ? makeSMSMessage(
                notTouchedTask.getIMSI(),
                notTouchedTask.getSMSC(),
                notTouchedTask.getReceiver(),
                notTouchedTask.getBoardSN(),
                notTouchedTask.getSMSContent(),
              )
            : makeCallMessage(
                notTouchedTask.getIMSI(),
                notTouchedTask.getBoardSN(),
              ),
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

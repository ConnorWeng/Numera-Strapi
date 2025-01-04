const short = require("short-uuid");
const { TASK_TIMEOUT, CLOUD_FETCH_ADVANCE_TIME } = require("./task-queue");

const parseOperator = (IMSI) => {
  let operator;
  const prefix = IMSI.substring(0, 5);
  if (
    prefix === "46000" ||
    prefix === "46002" ||
    prefix === "46004" ||
    prefix === "46007"
  ) {
    operator = "CMCC";
  } else if (prefix === "46001" || prefix === "46006" || prefix === "46009") {
    operator = "CUCC";
  } else {
    operator = "FOR";
  }
  return operator;
};

class TranslateTask {
  constructor(IMSI) {
    this.uid = short.generate();
    this.IMSI = IMSI;
    this.mode = 0;
    this.createTime = new Date().getTime();
    this.callingNumber = null;
    this.translatedTime = null;
    this.SMSData = [];
    this.error = null;
    this.taken = false;
    this.takenTime = null;
    this.operator = null;
    this.dailyRemaining = null;
    this.done = false;
    this.code = 999;
    this.derived = false;
    this.smsc = null;
    this.receiver = null;

    this.lastUpdateTime = new Date().getTime();
    this.lastQueryTime = new Date().getTime();
    this.lastSMSIndex = 0;

    this.device = null;

    if (IMSI) {
      this.operator = parseOperator(IMSI);
    }
  }

  getIMSI() {
    return this.IMSI;
  }

  getUID() {
    return this.uid;
  }

  getOperator() {
    return this.operator;
  }

  setOperator(operator) {
    this.operator = operator;
  }

  getCreateTime() {
    return this.createTime;
  }

  setIMSI(IMSI) {
    this.IMSI = IMSI;
    this.operator = parseOperator(IMSI);
  }

  setMode(mode) {
    this.mode = mode;
  }

  setCallingNumber(callingNumber) {
    this.callingNumber = callingNumber;
    if (!this.translatedTime) {
      this.translatedTime = new Date().getTime();
    }
  }

  setError(error) {
    this.error = error;
  }

  setDailyRemaining(dailyRemaining) {
    this.dailyRemaining = dailyRemaining;
  }

  setCode(code) {
    this.code = code;
  }

  setLastQueryTime(time) {
    this.lastQueryTime = time;
  }

  setLastSMSIndex(index) {
    this.lastSMSIndex = index;
  }

  setSMSC(smsc) {
    this.smsc = smsc;
  }

  setReceiver(receiver) {
    this.receiver = receiver;
  }

  setDevice(device) {
    this.device = device;
  }

  addSMS(SMS) {
    this.SMSData.push(SMS);
    this.lastUpdateTime = new Date().getTime();
  }

  getError() {
    return this.error;
  }

  take() {
    this.taken = true;
    this.takenTime = new Date().getTime();
  }

  isTaken() {
    return this.taken;
  }

  isPartialDone() {
    if (this.error !== null) {
      this.done = true;
      return this.done;
    } else {
      return this.callingNumber !== null && this.code !== 999;
    }
  }

  isDone() {
    if (this.isTranslateMode() || this.isSMSTranslateMode()) {
      this.done =
        (this.callingNumber !== null && this.code !== 999) ||
        this.error !== null;
    } else if (this.isCloudFetchMode()) {
      this.done = this.SMSData.length > 20 || this.error !== null;
    }
    return this.done;
  }

  isTimeout() {
    if (this.taken && !this.isDone()) {
      if (this.isTranslateMode() || this.isSMSTranslateMode()) {
        return (
          new Date().getTime() - this.takenTime > TASK_TIMEOUT[this.operator]
        );
      } else if (this.isCloudFetchMode()) {
        if (this.translatedTime) {
          return (
            new Date().getTime() - this.translatedTime >
            TASK_TIMEOUT[this.operator] - CLOUD_FETCH_ADVANCE_TIME
          );
        } else {
          return (
            new Date().getTime() - this.takenTime > TASK_TIMEOUT[this.operator]
          );
        }
      }
    } else {
      return false;
    }
  }

  isTranslateMode() {
    return this.mode === 0;
  }

  isSMSTranslateMode() {
    return this.mode === 2;
  }

  isCloudFetchMode() {
    return this.mode === 1;
  }
}

module.exports = TranslateTask;

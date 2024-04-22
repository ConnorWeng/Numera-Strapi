const { v4: uuidv4 } = require("uuid");

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
    // FIXME: 国外号码暂时写死用移动
    operator = "CMCC";
  }
  return operator;
};

class TranslateTask {
  constructor(IMSI) {
    this.uid = uuidv4();
    this.IMSI = IMSI;
    this.mode = 0;
    this.createTime = new Date().getTime();
    this.callingNumber = null;
    this.SMSData = [];
    this.error = null;
    this.taken = false;
    this.operator = null;
    this.dailyRemaining = null;
    this.done = false;
    this.code = 999;

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

  addSMS(SMS) {
    this.SMSData.push(SMS);
  }

  getError() {
    return this.error;
  }

  take() {
    this.taken = true;
  }

  isTaken() {
    return this.taken;
  }

  isDone() {
    if (this.mode === 0) {
      this.done = this.callingNumber !== null || this.error !== null;
    } else if (this.mode === 1) {
      this.done = this.SMSData.length > 5 || this.error !== null;
    }
    return this.done;
  }
}

module.exports = TranslateTask;

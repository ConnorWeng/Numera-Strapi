class TranslateTask {
  constructor(IMSI) {
    this.IMSI = IMSI;
    this.createTime = new Date().getTime();
    this.callingNumber = null;
    this.taken = false;
  }

  getIMSI() {
    return this.IMSI;
  }

  getCreateTime() {
    return this.createTime;
  }

  setCallingNumber(callingNumber) {
    this.callingNumber = callingNumber;
  }

  take() {
    this.taken = true;
  }

  isTaken() {
    return this.taken;
  }

  isDone() {
    return this.callingNumber !== null;
  }
}

module.exports = TranslateTask;

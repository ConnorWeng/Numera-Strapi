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

  getOperator() {
    const prefix = this.IMSI.substring(0, 5);
    if (
      prefix === "46000" ||
      prefix === "46002" ||
      prefix === "46004" ||
      prefix === "46007"
    ) {
      return "CMCC";
    } else if (prefix === "46001" || prefix === "46006" || prefix === "46009") {
      return "CUCC";
    }
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

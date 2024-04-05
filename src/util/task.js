class TranslateTask {
  constructor(IMSI) {
    this.IMSI = IMSI;
    this.createTime = new Date().getTime();
    this.callingNumber = null;
    this.error = null;
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
    } else { // FIXME: 国外号码暂时写死用移动
      return "CMCC";
    }
  }

  getCreateTime() {
    return this.createTime;
  }

  setCallingNumber(callingNumber) {
    this.callingNumber = callingNumber;
  }

  setError(error) {
    this.error = error;
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
    return this.callingNumber !== null || this.error !== null;
  }
}

module.exports = TranslateTask;

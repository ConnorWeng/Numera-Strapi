class Processor {
  constructor(device) {
    this.available = true;
    this.device = device;
  }

  isAvailable() {
    return this.available;
  }

  isMatch(task) {
    return true;
  }

  async process(task) {
    const that = this;
    that.available = false;
    strapi.log.info(
      "Device " +
        this.device.uid +
        " start processing " +
        that.constructor.name +
        " IMSI " +
        task.IMSI,
    );
    await this.processCall();
    await new Promise((resolve) =>
      setTimeout(() => {
        strapi.log.info(
          "Device " +
            this.device.uid +
            " finish processing " +
            that.constructor.name +
            " IMSI " +
            task.IMSI,
        );
        that.available = true;
        resolve();
      }, 15000),
    );
  }

  async processCall() {}
}

module.exports = Processor;

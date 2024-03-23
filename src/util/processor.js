const axios = require("axios");

class Processor {
  constructor(device) {
    this.available = true;
    this.device = device;
    this.axiosInstance = axios.create();
    this.axiosInstance.defaults.headers.common["Authorization"] =
      `Bearer ${device.apiToken}`;
  }

  isAvailable() {
    return this.available;
  }

  isMatch(task) {
    return task.getOperator() === this.device.operator;
  }

  async process(task) {
    const that = this;
    that.available = false;
    strapi.log.info(
      `Device ${this.device.ipAddress} start processing ${that.constructor.name} IMSI ${task.IMSI}`,
    );
    await this.processCall(task);
    await new Promise((resolve) =>
      setTimeout(() => {
        strapi.log.info(
          `Device ${this.device.ipAddress} finish processing ${that.constructor.name} IMSI ${task.IMSI}`,
        );
        that.available = true;
        resolve();
      }, 15000),
    );
  }

  async processCall(task) {
    strapi.log.info(
      `Starting call device http://${this.device.ipAddress}:${this.device.port}${this.device.apiPath}/api/local/call with IMSI ${task.IMSI}`,
    );
    this.axiosInstance
      .post(
        `http://${this.device.ipAddress}:${this.device.port}${this.device.apiPath}/api/local/call`,
        {
          data: {
            IMSI: task.IMSI,
          },
        },
      )
      .then((res) => {
        strapi.log.info(
          `Call device ${this.device.ipAddress} success: ${res.status}`,
        );
      })
      .catch((err) => {
        strapi.log.error(`Call device ${this.device.ipAddress} failed: ${err}`);
      });
  }
}

module.exports = Processor;

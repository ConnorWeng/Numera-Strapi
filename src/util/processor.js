const axios = require("axios");
const TaskQueue = require("./task-queue");

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
    strapi.log.info(
      `Device ${this.device.ipAddress} finish processing ${that.constructor.name} IMSI ${task.IMSI}`,
    );
    that.available = true;
  }

  async processCall(task) {
    if (task.mode === 0) {
      this.axiosInstance
        .delete(
          `http://${this.device.subdevice.ipAddress}:${this.device.subdevice.port}${this.device.subdevice.apiPath}`,
          {
            data: {},
          },
        )
        .then((res) => {
          strapi.log.info(
            `Switch ${this.device.subdevice.apiPath} to translate mode success`,
          );
        })
        .catch((err) => {
          strapi.log.error(
            `Switch ${this.device.subdevice.apiPath} to translate mode failed: ${err}`,
          );
        });
    } else if (task.mode === 1) {
      this.axiosInstance
        .get(
          `http://${this.device.subdevice.ipAddress}:${this.device.subdevice.port}${this.device.subdevice.apiPath}`,
        )
        .then((res) => {
          strapi.log.info(
            `Switch ${this.device.subdevice.apiPath} to cloud fetch mode success`,
          );
        })
        .catch((err) => {
          strapi.log.error(
            `Switch ${this.device.subdevice.apiPath} to cloud fetch mode failed: ${err}`,
          );
        });
    }
    strapi.log.info(
      `Starting call device http://${this.device.ipAddress}:${this.device.port}${this.device.apiPath}/api/local/call with IMSI ${task.IMSI}`,
    );
    this.axiosInstance
      .post(
        `http://${this.device.ipAddress}:${this.device.port}${this.device.apiPath}/api/local/call`,
        {
          data: {
            IMSI: task.IMSI,
            uid: task.uid,
            operator: task.operator,
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

    await TaskQueue.getInstance().waitUntilTaskDone(task);
  }
}

module.exports = Processor;

const axios = require("axios");
const { TaskQueue, TASK_TIMEOUT } = require("./task-queue");
const { TIMEOUT } = require("./error-codes");

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

  take() {
    this.available = false;
  }

  async process(task) {
    const that = this;
    that.available = false;
    strapi.log.info(
      `Device ${this.device.ipAddress} start processing ${that.constructor.name} task: ${JSON.stringify(task)}`,
    );

    task.setDevice(this.device);

    if (
      new Date().getTime() - task.getCreateTime() >
      TASK_TIMEOUT[task.operator]
    ) {
      task.setCode(TIMEOUT.code);
      task.setError(TIMEOUT);
      task.isDone();
      strapi.log.info(
        `Too long to be in the queue, timeout task: ${JSON.stringify(task)}`,
      );
    } else {
      await this.processCall(task);
      strapi.log.info(
        `Device ${this.device.ipAddress} finish processing ${that.constructor.name} task: ${JSON.stringify(task)}`,
      );
    }
    that.available = true;
  }

  async processCall(task) {
    if (task.isTranslateMode() || task.isSMSTranslateMode()) {
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
    } else if (task.isCloudFetchMode()) {
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
            mode: task.mode,
            smsc: task.smsc,
            receiver: task.receiver,
            boardSN: this.device.boardSN,
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

    let targetTask = task;
    if (task.derived) {
      targetTask = TaskQueue.getInstance().findClosestTask(task.uid);
    }
    await TaskQueue.getInstance().waitUntilTaskDone(targetTask);
  }
}

module.exports = Processor;

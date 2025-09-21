const axios = require("axios");
const { TaskQueue, TASK_TIMEOUT } = require("./task-queue");
const { TIMEOUT } = require("./error-codes");
const { sendNotifyEmail } = require("./common");

class Processor {
  constructor(device) {
    this.available = true;
    this.device = device;
    this.pool = null;
    this.axiosInstance = axios.create();
    this.axiosInstance.defaults.headers.common["Authorization"] =
      `Bearer ${device.apiToken}`;
  }

  setPool(pool) {
    this.pool = pool;
  }

  isAvailable() {
    return this.available;
  }

  isMatch(task) {
    return (
      task.getOperator() === this.device.operator &&
      (task.specifiedDevice == null ||
        task.specifiedDevice === this.device.apiPath)
    );
  }

  take() {
    this.available = false;
  }

  async process(task) {
    const that = this;
    that.available = false;
    strapi.log.info(
      `Device ${that.device.ipAddress} start processing ${that.constructor.name} task: ${JSON.stringify(task)}`,
    );

    task.setDevice(that.device);

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
      await that.processCall(task);
      strapi.log.info(
        `Device ${that.device.ipAddress} finish processing ${that.constructor.name} task: ${JSON.stringify(task)}`,
      );
    }

    if (that.pool) {
      that.pool.moveProcessorToEnd(that);
      strapi.log.info(
        `Moved processor for device ${that.device.apiPath} to the end of the pool: ${JSON.stringify(that.pool.processors.map((p) => p.device.apiPath))}`,
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
        .catch(async (err) => {
          const errorMsg = `Switch ${this.device.subdevice.apiPath} to translate mode failed: ${err}, pgy account: ${this.device.subdevice.pgyAccount}`;
          strapi.log.error(errorMsg);
          await sendNotifyEmail("Translate Mode Switch Error", errorMsg);
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
        .catch(async (err) => {
          const errorMsg = `Switch ${this.device.subdevice.apiPath} to cloud fetch mode failed: ${err}, pgy account: ${this.device.subdevice.pgyAccount}`;
          strapi.log.error(errorMsg);
          await sendNotifyEmail("Cloud Fetch Mode Switch Error", errorMsg);
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
            SMSContent: task.getSMSContent(),
          },
        },
      )
      .then((res) => {
        strapi.log.info(
          `Call device ${this.device.apiPath} success: ${res.status}`,
        );
      })
      .catch(async (err) => {
        const errorMsg = `Call device ${this.device.apiPath} failed: ${err}, pgy account: ${this.device.subdevice.pgyAccount}`;
        strapi.log.error(errorMsg);
        await sendNotifyEmail("Device Call Error", errorMsg);
      });

    let targetTask = task;
    if (task.derived) {
      targetTask = TaskQueue.getInstance().findClosestTask(task.uid);
    }
    await TaskQueue.getInstance().waitUntilTaskDone(targetTask);
  }
}

module.exports = Processor;

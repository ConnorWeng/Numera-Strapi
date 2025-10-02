const { exec } = require("child_process");
const dgram = require("dgram");
const Parser = require("binary-parser").Parser;
const axios = require("axios");
const UDPClient = require("./client");
const { Task, MemTaskManager } = require("./mem-task-manager");
const { parsePDU, parseText } = require("./sms");
const MobileWatchdog = require("./mobile-watchdog");
const {
  decodeHeader,
  decodeHeartbeat,
  decodeCall,
  decodeGSM,
  decodeSMS,
} = require("../util/udp");
const {
  handleRetryPolicy,
  isLastCallDataMeanSuccess,
} = require("./retry-policy-handler");
const { handleGSM } = require("./gsm");

const MsgHeaderLength = 3;
const MsgType = {
  MSG_SS_UE_INFO: 0xb3,
  MSG_SS_UE_CALL: 0xb1,
  MSG_SS_UE_SMS: 0xb4,
};

const taskManager = MemTaskManager.getInstance();

const watchdogs = {
  "dog-1": new MobileWatchdog(1),
  "dog-2": new MobileWatchdog(2),
  "dog-3": new MobileWatchdog(3),
  "dog-4": new MobileWatchdog(4),
};

if (process.env.IS_DEVICE === "true") {
  for (const key in watchdogs) {
    watchdogs[key].start();
  }
}

class UDPServer {
  static instance;

  constructor(port) {
    if (UDPServer.instance) {
      return UDPServer.instance;
    }

    this.port = port;
    this.server = dgram.createSocket("udp4");
    this.memoryStore = {
      heartbeat: null,
      call: null,
    };
    this.axiosInstance = axios.create();
    this.axiosInstance.defaults.headers.common["Authorization"] =
      `Bearer ${process.env.CLOUD_API_TOKEN}`;

    UDPServer.instance = this;
  }

  start() {
    this.server.on("error", (err) => {
      console.log(`server error:\n${err.stack}`);
      this.server.close();
    });

    this.server.on("message", this.handleMessage.bind(this));

    this.server.on("listening", () => {
      const address = this.server.address();
      console.log(`server listening ${address.address}:${address.port}`);
    });

    this.server.bind(this.port);
    strapi.log.info(`Start UDP server on port ${this.port}`);

    /* setTimeout(this.reportThisDeviceToCloudServer.bind(this), 1000 * 5); */
  }

  reportThisDeviceToCloudServer() {
    this.axiosInstance
      .post(`${process.env.CLOUD_API_URL}/api/devices`, {
        data: {
          type: "calling",
          operator: "CUCC",
          ipAddress: getLocalIP(),
          port: this.port,
        },
      })
      .then((res) => {
        strapi.log.info(`Report device to cloud server success: ${res.status}`);
      })
      .catch((err) => {
        strapi.log.error(`Report device to cloud server failed: ${err}`);
      });
  }

  close() {
    this.server.close();
  }

  feedDog(mobileNo) {
    if (watchdogs[`dog-${mobileNo}`]) {
      watchdogs[`dog-${mobileNo}`].feed();
    }
  }

  handleMessage(msg, rinfo) {
    const msgHeader = decodeHeader(msg);
    strapi.log.verbose(
      `server got ${msg.byteLength} bytes from ${rinfo.address}:${rinfo.port}, message header:\n` +
        `unCode: 0x${msgHeader.unCode.toString(16)}\n` +
        `unBodyLen: ${msgHeader.unBodyLen}\n` +
        `msgType: 0x${msgHeader.msgType.toString(16)}`,
    );
    if (msgHeader.msgType === MsgType.MSG_SS_UE_INFO) {
      const heartbeat = decodeHeartbeat(msg.subarray(MsgHeaderLength));
      this.saveHeartbeat(heartbeat);
    } else if (msgHeader.msgType === MsgType.MSG_SS_UE_CALL) {
      let call;
      if (process.env.SUPPORT_GSM === "true") {
        call = decodeGSM(msg.subarray(MsgHeaderLength), msgHeader.unBodyLen);
        strapi.log.info(
          `server got call data:\n` +
            `IMSI: ${call.IMSI}\n` +
            `boardSN: ${call.boardSN}\n` +
            `callData: ${call.callData}`,
        );
        let task = taskManager.getTask(call.IMSI, null);
        strapi.log.info(`Doing task: ${JSON.stringify(task)}`);
        if (!task) {
          return;
        }

        handleGSM(call, task, UDPClient.getInstance(), this);
      } else {
        call = decodeCall(msg.subarray(MsgHeaderLength));
        strapi.log.info(
          `server got call data:\n` +
            `IMSI: ${call.IMSI}\n` +
            `boardSN: ${call.boardSN}\n` +
            `callData: ${call.callData}`,
        );
        this.feedDog(call.callData[2]);
        if (msgHeader.unBodyLen === 40 || msgHeader.unBodyLen === 57) {
          let task = taskManager.getTask(call.IMSI, call.boardSN);
          strapi.log.info(`Doing task: ${JSON.stringify(task)}`);
          if (!task) {
            return;
          }

          if (isLastCallDataMeanSuccess(task)) {
            strapi.log.info(
              `Last call data already mean success, ignore this call data: ${JSON.stringify(task)}`,
            );
            return;
          }

          task.setTouched();
          task.appendLog(call.callData);
          handleRetryPolicy(call, task, UDPClient.getInstance(), this);
        }
      }
    } else if (msgHeader.msgType === MsgType.MSG_SS_UE_SMS) {
      strapi.log.verbose(`MSG_SS_UE_SMS received, hex: ${msg.toString("hex")}`);
      const sms = decodeSMS(msg.subarray(MsgHeaderLength));
      const smsObj = parsePDU(sms);
      let task = taskManager.getTask(sms.IMSI, sms.boardSN);
      strapi.log.info(`Doing task: ${JSON.stringify(task)}`);

      if (task) {
        task.setCause(sms.cause);
        task.setSMS(Object.assign({}, smsObj));
        if (smsObj || task.isSMSTranslateMode()) {
          this.reportCallToCloudServer(task);
        }
      }
    }
  }

  reportCallToCloudServer(task) {
    strapi.log.info(`Report call to cloud server: ${JSON.stringify(task)}`);
    this.axiosInstance
      .post(`${process.env.CLOUD_API_URL}/api/calls`, {
        data: task,
      })
      .then((res) => {
        strapi.log.info(`Report call to cloud server success: ${res.status}`);
      })
      .catch((err) => {
        strapi.log.error(`Report call to cloud server failed: ${err}`);
      });
  }

  saveHeartbeat(heartbeat) {
    this.memoryStore.heartbeat = Object.assign(
      {
        lastUpdatedAt: new Date().getTime(),
      },
      heartbeat,
    );
    // TODO: maybe report to cloud server use device api later
  }

  killMobile(callData) {
    if (process.env.OPERATOR === "CUCC") return;
    const findcmd = `pgrep -f "mobile ${callData[2]}"`;
    strapi.log.info(`Find mobile with cmd: ${findcmd}`);
    exec(findcmd, (error, stdout, stderr) => {
      if (error) {
        strapi.log.error(`Error when exec shell: ${error}`);
        return;
      }
      if (stdout) {
        strapi.log.info(`Find mobile stdout: ${stdout}`);
        const parts = stdout.split("\n");
        if (parts.length > 1) {
          const killcmd = `kill -9 ${parts[0]}; kill -9 ${parts[1]}`;
          strapi.log.info(`Kill with cmd: ${killcmd}`);
          exec(killcmd, (error, stdout, stderr) => {
            if (error) {
              strapi.log.error(`Error when kill: ${error}`);
              return;
            }
            strapi.log.info(`Kill process ${stdout}`);
          });
        }
      }
    });
  }

  getMemoryStore() {
    return this.memoryStore;
  }

  static getInstance(port) {
    if (!UDPServer.instance) {
      UDPServer.instance = new UDPServer(port);
    }
    return UDPServer.instance;
  }
}

const os = require("os");

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const intf of interfaces[name]) {
      const { address, family, internal } = intf;

      if (family === "IPv4" && !internal) {
        return address;
      }
    }
  }

  return null;
}

module.exports = UDPServer;

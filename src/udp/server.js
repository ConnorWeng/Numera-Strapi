const dgram = require("dgram");
const Parser = require("binary-parser").Parser;
const axios = require("axios");
const pdu = require("pdu");
const moment = require("moment");
const UDPClient = require("./client");
const { makeCallMessage } = require("../util/message");
const { Task, MemTaskManager } = require("./mem-task-manager");

const MsgHeaderLength = 3;
const MsgType = {
  MSG_SS_UE_INFO: 0xb3,
  MSG_SS_UE_CALL: 0xb1,
  MSG_SS_UE_SMS: 0xb4,
};
const CauseMap = {
  xfe_x01: { message: "空号", code: 1 },
  xfe_x08: { message: "物联网卡或流量卡", code: 3 },
  xfe_x15: { message: "物联网卡或流量卡", code: 6 },
  xfe_x1f: { message: "可忽略错误", code: 0 },
  xfe_x26: { message: "不支持的新卡", code: 2 },
  xfe_x39: { message: "物联网卡或流量卡", code: 5 },
  xff_x01: { message: "空号", code: 1 },
  xff_x08: { message: "物联网卡或流量卡", code: 3 },
  xff_x15: { message: "物联网卡或流量卡", code: 6 },
  xff_x1f: { message: "可忽略错误", code: 0 },
  xff_x26: { message: "不支持的新卡", code: 2 },
  xff_x39: { message: "物联网卡或流量卡", code: 5 },
  x03_x00: { message: "RELEASE", code: 9 },
  x04_x00: { message: "AUTHENTICATION REJECT", code: 8 },
  x05_x00: { message: "LOCATION REJECT", code: 9 },
  x06_x00: { message: "ASSIGNMENT FAILURE", code: 10 },
  x0a_x00: { message: "3126", code: 9 },
  x31_x33: { message: "NO RESPONSE", code: 10 },
  x08_x00: { message: "SUCCESS", code: 0 },
  x09_x00: { message: "SUCCESS", code: 0 },
};

const taskManager = MemTaskManager.getInstance();

function hex(number) {
  return number.toString(16).padStart(2, "0");
}

function isLastCallDataMeanSuccess(task) {
  const logs = task.getLogs();
  if (logs.length === 0) {
    return false;
  }
  const lastCallData = logs[logs.length - 1];
  const policy = getCausePolicy(lastCallData);
  if (policy.policy === "SUCCESS") {
    return true;
  }
  return false;
}

function getCausePolicy(callData) {
  const cause = CauseMap[`x${hex(callData[0])}_x${hex(callData[1])}`];
  if (callData[0] === 0xfe || callData[0] === 0xff) {
    if ([0x01, 0x08, 0x15, 0x26, 0x39].includes(callData[1])) {
      return {
        policy: "REJECT",
        cause: callData[1],
        ...cause,
      };
    } else if (callData[1] === 0x1f) {
      return {
        policy: "SUCCESS",
        cause: callData[1],
        ...cause,
      };
    } else {
      return {
        policy: "RETRY",
        cause: callData[1],
        message: "UNKNOWN CAUSE",
        code: 7,
      };
    }
  }
  if (
    [0x03, 0x04, 0x05, 0x06, 0x0a].includes(callData[0]) &&
    callData[1] === 0x00
  ) {
    return {
      policy: "RETRY",
      cause: callData[0],
      ...cause,
    };
  }
  if (callData[0] === 0x31 && callData[1] === 0x33) {
    return {
      policy: "RETRY",
      cause: callData[0],
      ...cause,
    };
  }
  if ([0x08, 0x09].includes(callData[0]) && callData[1] === 0x00) {
    return {
      policy: "SUCCESS",
      cause: callData[0],
      ...cause,
    };
  }
  return {
    policy: "CONTINUE",
    cause: -1,
    message: "UNKNOWN CAUSE",
    code: 0,
  };
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

  handleMessage(msg, rinfo) {
    const msgHeader = this.decodeHeader(msg);
    strapi.log.verbose(
      `server got ${msg.byteLength} bytes from ${rinfo.address}:${rinfo.port}, message header:\n` +
        `unCode: 0x${msgHeader.unCode.toString(16)}\n` +
        `unBodyLen: ${msgHeader.unBodyLen}\n` +
        `msgType: 0x${msgHeader.msgType.toString(16)}`,
    );
    if (msgHeader.msgType === MsgType.MSG_SS_UE_INFO) {
      const heartbeat = this.decodeHeartbeat(msg.subarray(MsgHeaderLength));
      /* strapi.log.verbose(
        `server got heartbeat:\n` +
          `IMSI: ${heartbeat.IMSI}\n` +
          `boardSN: ${heartbeat.boardSN}\n` +
          `mobStates: ${heartbeat.mobStates}\n` +
          `selArfcns: ${heartbeat.selArfcns}\n` +
          `selLacs: ${heartbeat.selLacs}\n` +
          `selIds: ${heartbeat.selIds}\n` +
          `rlaCDbms: ${heartbeat.rlaCDbms}`,
      ); */
      this.saveHeartbeat(heartbeat);
    } else if (msgHeader.msgType === MsgType.MSG_SS_UE_CALL) {
      const call = this.decodeCall(msg.subarray(MsgHeaderLength));
      strapi.log.info(
        `server got call data:\n` +
          `IMSI: ${call.IMSI}\n` +
          `boardSN: ${call.boardSN}\n` +
          `callData: ${call.callData}`,
      );
      if (msgHeader.unBodyLen === 40 || msgHeader.unBodyLen === 57) {
        let task = taskManager.getTask(call.IMSI);
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
        const policy = getCausePolicy(call.callData);
        strapi.log.info(
          `Policy for IMSI: ${call.IMSI} is ${JSON.stringify(policy)}`,
        );

        if (policy.policy === "REJECT") {
          task.setError({
            errorCode: policy.cause,
            errorMessage: policy.message + ":\n" + task.getLog(),
            code: policy.code,
          });
          this.reportCallToCloudServer(task);
        } else if (policy.policy === "RETRY") {
          if (task.getRetriedTimes() < 2) {
            task.increaseRetry();
            strapi.log.info(`Retry call to IMSI: ${call.IMSI}`);
            UDPClient.getInstance().send(
              makeCallMessage(call.IMSI),
              9000,
              "localhost",
            );
          } else {
            task.setError({
              errorCode: policy.cause,
              errorMessage: policy.message + ":\n" + task.getLog(),
              code: policy.code,
            });
            this.reportCallToCloudServer(task);
          }
        } else if (policy.policy === "SUCCESS") {
          strapi.log.info(`Call success to IMSI: ${call.IMSI}`);
        } else if (policy.policy === "CONTINUE") {
          // Do nothing
        }
      }
    } else if (msgHeader.msgType === MsgType.MSG_SS_UE_SMS) {
      const sms = this.decodeSMS(msg.subarray(MsgHeaderLength));
      let task = taskManager.getTask(sms.IMSI);
      if (!task) {
        return;
      }

      const buffer = Buffer.from(sms.SMSData);
      const newBuffer = Buffer.alloc(buffer.length - 2);
      buffer.copy(newBuffer, 0, 0, 8);
      buffer.copy(newBuffer, 8, 10);
      const smsObj = pdu.parse(newBuffer.toString("hex"));
      strapi.log.info(
        "server got SMS message:\n" +
          `IMSI: ${sms.IMSI}\n` +
          `boardSN: ${sms.boardSN}\n` +
          `SMSData Hex: ${Buffer.from(sms.SMSData).toString("hex")}\n` +
          `SMSData: ${JSON.stringify(smsObj)}`,
      );
      smsObj.time.setHours(smsObj.time.getHours() + 8);
      task.setSMS(
        Object.assign(
          {},
          {
            sender: smsObj.sender.substring(0, smsObj.sender.length - 2),
            time: moment(smsObj.time).format("YYYY-MM-DD HH:mm:ss.SSS"),
            text: smsObj.text
              .replace("\u0000u", "")
              .replace(/[\n\u001d\u0000]/g, "")
              .trim(),
          },
        ),
      );
      this.reportCallToCloudServer(task);
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

  decodeHeader(buffer) {
    const parser = new Parser()
      .endianness("big")
      .uint8("unCode")
      .uint8("unBodyLen")
      .uint8("msgType");
    return parser.parse(buffer);
  }

  decodeHeartbeat(buffer) {
    const parser = new Parser()
      .endianness("big")
      .string("IMSI", { length: 15, encoding: "utf8" })
      .bit8("IMSIEnd")
      .string("boardSN", { length: 19, encoding: "utf8" })
      .bit8("boardSNEnd")
      .array("mobStates", {
        type: "uint8",
        length: 4,
      })
      .array("selArfcns", {
        type: "uint16be",
        length: 4,
      })
      .array("selLacs", {
        type: "uint16be",
        length: 4,
      })
      .array("selIds", {
        type: "uint16be",
        length: 4,
      })
      .array("rlaCDbms", {
        type: "uint8",
        length: 4,
      });
    return parser.parse(buffer);
  }

  decodeCall(buffer) {
    const parser = new Parser()
      .endianness("big")
      .string("IMSI", { length: 15, encoding: "utf8" })
      .bit8("IMSIEnd")
      .string("boardSN", { length: 19, encoding: "utf8" })
      .bit8("boardSNEnd")
      .array("callData", {
        type: "uint8",
        length: 4,
      });
    return parser.parse(buffer);
  }

  decodeSMS(buffer) {
    const parser = new Parser()
      .endianness("big")
      .string("IMSI", { length: 15, encoding: "utf8" })
      .bit8("IMSIEnd")
      .string("boardSN", { length: 19, encoding: "utf8" })
      .bit8("boardSNEnd")
      .array("SMSData", {
        type: "uint8",
        length: buffer.byteLength - 36,
      });
    return parser.parse(buffer);
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

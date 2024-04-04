const dgram = require("dgram");
const Parser = require("binary-parser").Parser;
const axios = require("axios");
const UDPClient = require("./client");
const { makeCallMessage } = require("../util/message");

const MsgHeaderLength = 3;
const MsgType = {
  MSG_SS_UE_INFO: 0xb3,
  MSG_SS_UE_CALL: 0xb1,
};
const CauseMessage = {
  Cause1: "空号",
  Cause8: "物联网卡或流量卡",
  Cause21: "物联网卡或流量卡",
  Cause31: "物联网卡或流量卡",
  Cause38: "不支持的新卡",
  Cause57: "物联网卡或流量卡",
};
const RetryableCause = {
  Cause4: "AUTHENTICATION REJECT",
  Cause5: "LOCATION REJECT",
  Cause6: "ASSIGNMENT FAILURE",
  Cause8: "NO RESPONSE",
  Cause10: "3126",
};
const RetriedTasks = [];

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
      if (msgHeader.unBodyLen === 40) {
        if (call.callData[0] === 0xfe || call.callData[0] === 0xff) {
          if (CauseMessage[`Cause${call.callData[1]}`]) {
            this.reportCallErrorToCloudServer({
              error: {
                errorCode: call.callData[1],
                errorMessage: CauseMessage[`Cause${call.callData[1]}`],
              },
            });
          } else {
            strapi.log.info(`Unknown cause code: ${call.callData[1]}`);
          }
        }
        if (RetryableCause[`Cause${call.callData[0]}`]) {
          const findIndex = RetriedTasks.findIndex(
            (IMSI) => IMSI === call.IMSI,
          );
          if (findIndex > -1) {
            RetriedTasks.splice(findIndex, 1);
            this.reportCallErrorToCloudServer({
              error: {
                errorCode: call.callData[0],
                errorMessage: RetryableCause[`Cause${call.callData[0]}`],
              },
            });
          } else {
            strapi.log.info(`Retry call to IMSI: ${call.IMSI}`);
            RetriedTasks.push(call.IMSI);
            UDPClient.getInstance().send(
              makeCallMessage(call.IMSI),
              9000,
              "localhost",
            );
          }
        }
        // 正常情况什么都不需要操作，等被叫上送号码给云端
      }
    }
  }

  reportCallErrorToCloudServer(error) {
    strapi.log.info(`Report error to cloud server: ${JSON.stringify(error)}`);
    this.axiosInstance
      .post(`${process.env.CLOUD_API_URL}/api/calls`, {
        data: error,
      })
      .then((res) => {
        strapi.log.info(`Report error to cloud server success: ${res.status}`);
      })
      .catch((err) => {
        strapi.log.error(`Report error to cloud server failed: ${err}`);
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

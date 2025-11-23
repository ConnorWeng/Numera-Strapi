const { exec } = require("child_process");
const { makeCallMessage, makeSMSMessage } = require("../util/message");
const { hex } = require("../util/common");

const CauseMap = {
  xfe_x01: { message: "空号", code: 1 },
  xfe_x08: { message: "物联网卡或流量卡", code: 3 },
  xfe_x15: { message: "物联网卡或流量卡", code: 6 },
  xfe_x1f: { message: "物联网卡或流量卡", code: 4 },
  xfe_x26: { message: "不支持的新卡", code: 2 },
  xfe_x39: { message: "物联网卡或流量卡", code: 5 },
  xfe_x60: { message: "96", code: 9 },
  xff_x01: { message: "空号", code: 1 },
  xff_x08: { message: "物联网卡或流量卡", code: 3 },
  xff_x15: { message: "物联网卡或流量卡", code: 6 },
  xff_x1f: { message: "物联网卡或流量卡", code: 4 },
  xff_x26: { message: "不支持的新卡", code: 2 },
  xff_x39: { message: "物联网卡或流量卡", code: 5 },
  xff_x60: { message: "96", code: 9 },
  x03_x00: { message: "RELEASE", code: 7 },
  x04_x00: { message: "AUTHENTICATION REJECT", code: 7 },
  x05_x00: { message: "LOCATION REJECT", code: 7 },
  x06_x00: { message: "ASSIGNMENT FAILURE", code: 7 },
  x0a_x00: { message: "3126", code: 7 },
  x31_x33: { message: "NO RESPONSE", code: 7 },
  x09_x00: { message: "SUCCESS", code: 0 },
};

function getCausePolicy(callData) {
  const cause = CauseMap[`x${hex(callData[0])}_x${hex(callData[1])}`];
  if (callData[0] === 0xfe || callData[0] === 0xff) {
    if ([0x01, 0x08, 0x15, 0x1f, 0x26, 0x39].includes(callData[1])) {
      return {
        policy: "REJECT",
        cause: callData[1],
        ...cause,
      };
    } else if ([0x60].includes(callData[1])) {
      return {
        policy: "RETRY",
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
  if ([0x09].includes(callData[0]) && callData[1] === 0x00) {
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

function handleRetryPolicy(call, task, udpClient, serverInstance) {
  const policy = getCausePolicy(call.callData);
  strapi.log.info(`Policy for IMSI: ${call.IMSI} is ${JSON.stringify(policy)}`);

  if (policy.policy === "REJECT") {
    task.setError({
      errorCode: policy.cause,
      errorMessage: policy.message + ":\n" + task.getLog(),
      code: policy.code,
    });
    serverInstance.reportCallToCloudServer(task);
  } else if (policy.policy === "RETRY") {
    killMobile(call.callData);
    if (task.getRetriedTimes() < 3) {
      task.increaseRetry();
      strapi.log.info(`Retry call to IMSI: ${call.IMSI}`);
      udpClient.send(
        task.isSMSTranslateMode()
          ? makeSMSMessage(
              call.IMSI,
              task.getSMSC(),
              task.getReceiver(),
              task.getBoardSN(),
              task.getSMSContent(),
            )
          : makeCallMessage(call.IMSI, task.getBoardSN()),
        9000,
        "localhost",
      );
    } else {
      task.setError({
        errorCode: policy.cause,
        errorMessage: policy.message + ":\n" + task.getLog(),
        code: policy.code,
      });
      serverInstance.reportCallToCloudServer(task);
    }
  } else if (policy.policy === "SUCCESS") {
    strapi.log.info(`Call success to IMSI: ${call.IMSI}`);
    task.updateCalledAt();
    if (task.isTranslateMode()) {
      killMobile(call.callData);
    }
  } else if (policy.policy === "CONTINUE") {
    // Do nothing
  }
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

function killMobile(callData) {
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

module.exports = {
  handleRetryPolicy,
  isLastCallDataMeanSuccess,
};

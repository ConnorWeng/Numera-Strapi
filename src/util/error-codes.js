module.exports = {
  TIMEOUT: {
    errorCode: 1001,
    errorMessage: "任务超时",
    code: 11,
  },
  MISSING_DATA: {
    errorCode: 1002,
    errorMessage: "请求内容缺少必要数据",
    code: 1,
  },
  INVALID_IMSI: {
    errorCode: 1003,
    errorMessage: "无效的IMSI",
    code: 1,
  },
  NO_ACTIVE_SUBSCRIPTION: {
    errorCode: 1004,
    errorMessage: "没有生效的合同",
    code: -1,
  },
  DAILY_REMAINING_RUN_OUT: {
    errorCode: 1005,
    errorMessage: "今日次数已用完",
    code: -1,
  },
  SUBSCRIPTION_EXPIRED: {
    errorCode: 1006,
    errorMessage: "合同已过期",
    code: -1,
  },
  MODE_NOT_ALLOWED: {
    errorCode: 1007,
    errorMessage: "翻译模式不被允许",
    code: -1,
  },
  IMSI_NOT_ALLOWED: {
    errorCode: 1008,
    errorMessage: "当前IMSI不被允许",
    code: -1,
  },
};

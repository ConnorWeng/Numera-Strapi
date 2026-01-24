module.exports = {
  config: {
    "api::cloud-fetch-record.cloud-fetch-record": {
      columns: ["userId", "userName", "date", "IMSI"],
      relation: {},
      locale: "false",
    },
    "api::record.record": {
      columns: ["userId", "userName", "IMSI", "count", "mode", "yearMonth"],
      relation: {},
      locale: "false",
    },
  },
};

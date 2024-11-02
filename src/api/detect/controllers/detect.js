"use strict";

const strapiUtils = require("@strapi/utils");
const axios = require("axios");

/**
 * detect controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

const axiosInstance = axios.create();

function getOperator(phoneNumber) {
  // 移动号段
  const mobilePrefixes = [
    "134",
    "135",
    "136",
    "137",
    "138",
    "139",
    "150",
    "151",
    "152",
    "157",
    "158",
    "159",
    "182",
    "183",
    "184",
    "187",
    "188",
    "147",
    "178",
    "198",
  ];
  // 联通号段
  const unicomPrefixes = [
    "130",
    "131",
    "132",
    "155",
    "156",
    "185",
    "186",
    "145",
    "176",
    "166",
  ];

  const prefix = phoneNumber.substring(0, 3);

  if (mobilePrefixes.includes(prefix)) {
    return "CMCC";
  } else if (unicomPrefixes.includes(prefix)) {
    return "CUCC";
  } else {
    return "CMCC";
  }
}

module.exports = createCoreController("api::detect.detect", ({ strapi }) => ({
  async create(ctx) {
    // @ts-ignore
    const { data } = ctx.request.body;
    const { phone } = data;

    const devices = await strapi.db.query("api::device.device").findMany({
      populate: { subdevice: true },
    });
    const detectDevices = devices.filter(
      (device) => device.type === "detector",
    );
    if (detectDevices.length === 0) {
      throw new strapiUtils.errors.NotFoundError("No detector device found");
    }

    const detector = detectDevices[0];
    const res = await axiosInstance.post(
      `http://${detector.ipAddress}:${detector.port}${detector.apiPath}/api/v1/mobile/check`,
      {
        operator: getOperator(phone),
        phone: phone,
      },
    );
    if (res.status == 200) {
      return {
        imsi_phone: phone,
        state: res.data.result,
        done: true,
      };
    } else {
      return {
        imsi_phone: phone,
        state: "UNKNOWN",
        done: true,
      };
    }
  },
}));

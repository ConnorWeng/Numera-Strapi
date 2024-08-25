const pdu = require("pdu");
const moment = require("moment");

const parsePDU = (sms) => {
  let result = null;
  const buffer = Buffer.from(sms.SMSData);
  if (buffer.length < 10) {
    strapi.log.info(`SMS data is too short: ${JSON.stringify(sms)}`);
    return;
  }

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
  if (smsObj.text) {
    smsObj.time.setHours(smsObj.time.getHours() + 8);
    smsObj.text = smsObj.text
      .replace("\u0000u", "")
      .replace(/[\n\u001d\u0000]/g, "")
      .trim();
    if (smsObj.encoding === "7bit") {
      smsObj.text = smsObj.text.substring(0, smsObj.text.length - 2);
    }
    result = {
      sender: smsObj.sender.substring(0, smsObj.sender.length - 2),
      time: moment(smsObj.time).format("YYYY-MM-DD HH:mm:ss.SSS"),
      text: smsObj.text,
    };
  }
  return result;
};

const parseText = (sms) => {
  strapi.log.info(
    `server got SMS message: ${Buffer.from(sms.SMSData).toString("utf-8")}`,
  );
  return null;
};

module.exports = {
  parsePDU,
  parseText,
};

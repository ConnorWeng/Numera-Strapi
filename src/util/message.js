var pdu = require("pdu");

const MsgType = {
  MSG_SS_UE_INFO: 0xb3,
  MSG_SS_UE_CALL: 0xb1,
  MSG_SS_UE_SMS: 0xb4,
};

const UnCode = 0xe5;
const EndByte = 0xea;

function makeMessageHeader(msgType, bodyLength) {
  const data = new DataView(new ArrayBuffer(3));
  data.setUint8(0, UnCode);
  data.setUint8(1, bodyLength);
  data.setUint8(2, msgType);
  return Buffer.from(data.buffer);
}

function makeCallMessage(IMSI) {
  const bodyLength = 57;
  const headerBuffer = makeMessageHeader(MsgType.MSG_SS_UE_CALL, bodyLength);
  const bodyData = new DataView(new ArrayBuffer(bodyLength));
  const boardSN = "0123456789012345678";
  const mobileNo = "13636609965";
  let lastOffset = setString(bodyData, 0, IMSI);
  lastOffset = setString(bodyData, lastOffset + 2, boardSN);
  lastOffset = setString(bodyData, lastOffset + 2, mobileNo);
  lastOffset = setString(bodyData, lastOffset + 2, "00000000");
  bodyData.setUint8(lastOffset + 1, EndByte);
  const buffer = Buffer.concat([headerBuffer, Buffer.from(bodyData.buffer)]);
  return buffer;
}

function makeSMSMessage(IMSI) {
  const bodyData = new DataView(new ArrayBuffer(100));
  let lastOffset = setString(bodyData, 0, IMSI);
  lastOffset = setNumber(bodyData, lastOffset + 2, "8613010344500");
  lastOffset = setNumber(bodyData, lastOffset + 3, "13636609965");

  bodyData.setUint8(lastOffset + 11, 0x00); // encoding
  lastOffset = lastOffset + 11;

  const pdus = pdu.generate({
    text: IMSI,
    receiver: 13636609965, //MSISDN
    encoding: "7bit", //Or 7bit if you're sending an ascii message.
  });
  const pduMessage = pdus[0];

  bodyData.setUint8(lastOffset + 1, pduMessage.length); // data length
  lastOffset = lastOffset + 1;

  lastOffset = setString(bodyData, lastOffset + 1, pduMessage); // data

  bodyData.setUint8(lastOffset + 1, EndByte);
  lastOffset = lastOffset + 1;

  const bodyLength = lastOffset + 1;
  const headerBuffer = makeMessageHeader(MsgType.MSG_SS_UE_SMS, 0x12);
  const buffer = Buffer.concat([
    headerBuffer,
    Buffer.from(bodyData.buffer, 0, bodyLength),
  ]);
  return buffer;
}

function setString(dataview, offset, str) {
  let lastOffset = offset;
  for (let i = 0; i < str.length; i++) {
    lastOffset = offset + i;
    dataview.setUint8(lastOffset, str.charCodeAt(i));
  }
  return lastOffset;
}

function setNumber(dataview, offset, str) {
  let lastOffset = offset;
  for (let i = 0; i < str.length; i++) {
    lastOffset = offset + i;
    dataview.setUint8(lastOffset, parseInt(str.charAt(i)));
  }
  return lastOffset;
}

module.exports = {
  makeCallMessage,
  makeSMSMessage,
  MsgType,
};

/* decodeHeader(buffer) {
  const parser = new Parser()
    .endianness("big")
    .uint8("unCode")
    .uint8("unBodyLen")
    .uint8("msgType");
  return parser.parse(buffer);
}

decodeCall(buffer) {
  const parser = new Parser()
    .endianness("big")
    .string("IMSI", { length: 16, encoding: "utf8" })
    .string("boardSN", { length: 20, encoding: "utf8" })
    .string("callData", { length: 20, encoding: "utf8" });
  return parser.parse(buffer);
} */

const MsgType = {
  MSG_SS_UE_INFO: 0xb3,
  MSG_SS_UE_CALL: 0xb1,
};

function makeCallMessage(IMSI) {
  let tempBuffer = Buffer.from(IMSI, "utf8");
  let temHex = tempBuffer.toString("hex");
  let hexString = `e539b1${temHex}0030313233343536373839303132333435363738003133363336363039393635003030303030303030ea`;
  let buffer = Buffer.from(hexString, "hex");
  return buffer;
}

module.exports = {
  makeCallMessage,
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

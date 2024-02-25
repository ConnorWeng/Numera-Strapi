const MsgType = {
  MSG_SS_UE_INFO: 0xb3,
  MSG_SS_UE_CALL: 0xb1,
};

export function makeCallMessage(IMSI) {}

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

const Parser = require("binary-parser").Parser;

function decodeHeader(buffer) {
  const parser = new Parser()
    .endianness("big")
    .uint8("unCode")
    .uint8("unBodyLen")
    .uint8("msgType");
  return parser.parse(buffer);
}

function decodeHeartbeat(buffer) {
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

function decodeCall(buffer) {
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

function decodeGSM(buffer) {
  const parser = new Parser()
    .endianness("big")
    .string("IMSI", { length: 15, encoding: "utf8" })
    .bit8("IMSIEnd")
    .string("boardSN", { length: 19, encoding: "utf8" })
    .bit8("boardSNEnd")
    .array("callData", {
      type: "uint8",
      length: 37,
    });
  return parser.parse(buffer);
}

function decodeSMS(buffer) {
  const smsDataLength = buffer.byteLength - 36;
  const mainSmsDataLength =
    smsDataLength >= 2 ? smsDataLength - 2 : smsDataLength;
  const hasCause = smsDataLength >= 2;

  const parser = new Parser()
    .endianness("big")
    .string("IMSI", { length: 15, encoding: "utf8" })
    .bit8("IMSIEnd")
    .string("boardSN", { length: 19, encoding: "utf8" })
    .bit8("boardSNEnd")
    .array("SMSData", {
      type: "uint8",
      length: mainSmsDataLength,
    });

  if (hasCause) {
    parser.uint8("cause").uint8("lastByte");
  }

  const result = parser.parse(buffer);

  if (hasCause) {
    result.SMSData.push(result.cause, result.lastByte);
    delete result.lastByte;
  }

  return result;
}

module.exports = {
  decodeHeader,
  decodeHeartbeat,
  decodeCall,
  decodeGSM,
  decodeSMS,
};

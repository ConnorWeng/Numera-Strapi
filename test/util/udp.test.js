const {
  decodeHeader,
  decodeHeartbeat,
  decodeCall,
  decodeSMS,
} = require("../../src/util/udp");

describe("UDP Decoders", () => {
  describe("decodeHeader", () => {
    it("should decode a header buffer correctly", () => {
      const buffer = Buffer.from([0xe5, 0x28, 0xb1]);
      const result = decodeHeader(buffer);
      expect(result).toEqual({
        unCode: 0xe5,
        unBodyLen: 0x28,
        msgType: 0xb1,
      });
    });
  });

  describe("decodeHeartbeat", () => {
    it("should decode a heartbeat buffer correctly", () => {
      const imsi = "123456789012345";
      const boardSN = "SN-1234567890123456";
      const buffer = Buffer.concat([
        Buffer.from(imsi, "utf8"),
        Buffer.from([0x00]),
        Buffer.from(boardSN, "utf8"),
        Buffer.from([0x00]),
        Buffer.from([1, 2, 3, 4]), // mobStates
        Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]), // selArfcns
        Buffer.from([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10]), // selLacs
        Buffer.from([0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18]), // selIds
        Buffer.from([5, 6, 7, 8]), // rlaCDbms
      ]);
      const result = decodeHeartbeat(buffer);
      expect(result).toEqual({
        IMSI: imsi,
        IMSIEnd: 0,
        boardSN: boardSN,
        boardSNEnd: 0,
        mobStates: [1, 2, 3, 4],
        selArfcns: [258, 772, 1286, 1800],
        selLacs: [2314, 2828, 3342, 3856],
        selIds: [4370, 4884, 5398, 5912],
        rlaCDbms: [5, 6, 7, 8],
      });
    });
  });

  describe("decodeCall", () => {
    it("should decode a call buffer correctly", () => {
      const imsi = "123456789012345";
      const boardSN = "SN-1234567890123456";
      const buffer = Buffer.concat([
        Buffer.from(imsi, "utf8"),
        Buffer.from([0x00]),
        Buffer.from(boardSN, "utf8"),
        Buffer.from([0x00]),
        Buffer.from([1, 2, 3, 4]), // callData
      ]);
      const result = decodeCall(buffer);
      expect(result).toEqual({
        IMSI: imsi,
        IMSIEnd: 0,
        boardSN: boardSN,
        boardSNEnd: 0,
        callData: [1, 2, 3, 4],
      });
    });
  });

  describe("decodeSMS", () => {
    it("should decode an SMS buffer correctly", () => {
      const imsi = "123456789012345";
      const boardSN = "SN-1234567890123456";
      const smsData = [0x01, 0x02, 0x03, 0x04, 0x05];
      const buffer = Buffer.concat([
        Buffer.from(imsi, "utf8"),
        Buffer.from([0x00]),
        Buffer.from(boardSN, "utf8"),
        Buffer.from([0x00]),
        Buffer.from(smsData),
      ]);
      const result = decodeSMS(buffer);
      expect(result).toEqual({
        IMSI: imsi,
        IMSIEnd: 0,
        boardSN: boardSN,
        boardSNEnd: 0,
        SMSData: smsData,
      });
    });
  });
});

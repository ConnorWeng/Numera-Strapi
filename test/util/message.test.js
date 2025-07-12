const { makeCallMessage, makeSMSMessage } = require("../../src/util/message");

describe("makeCallMessage", () => {
  test("should return a buffer with the correct hex string", () => {
    const IMSI = "460029211621800";
    const expectedHexString =
      "e539b13436303032393231313632313830300030313233343536373839303132333435363738003133363336363039393635003030303030303030ea";
    const result = makeCallMessage(IMSI);
    expect(result.toString("hex")).toEqual(expectedHexString);
  });
});

describe("makeSMSMessage", () => {
  test("should return a buffer with the correct hex string", () => {
    const IMSI = "460029211621800";
    const expectedHexString =
      "e55ab4343630303239323131363231383030003031323334353637383930313233343536373800383631333830303231303530300000313338313633313030323400000000000000000000000f341b0c26cbc962319b2c8683c14020ea";
    const result = makeSMSMessage(IMSI);
    expect(result.toString("hex")).toEqual(expectedHexString);
  });
});

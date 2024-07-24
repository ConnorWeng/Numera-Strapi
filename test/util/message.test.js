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
      "e539b13436303032393231313632313830300030313233343536373839303132333435363738003133363336363039393635003030303030303030ea";
    const result = makeSMSMessage(IMSI);
    expect(result.toString("hex")).toEqual(expectedHexString);
  });
});

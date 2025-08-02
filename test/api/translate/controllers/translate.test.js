// test/api/translate/controllers/translate.test.js

// Mock @strapi/strapi to intercept the factory function
jest.mock("@strapi/strapi", () => ({
  factories: {
    createCoreController: jest.fn((uid, factory) => factory),
  },
}));

// Mock the entire create-helpers module
jest.mock("../../../../src/api/translate/controllers/create-helpers");

// Mock the common utility module
jest.mock("../../../../src/util/common");

// Now require the mocked modules to get access to the mock functions
const {
  validateRequest,
  checkSubscription,
  verifySignature,
  determineOperator,
  processTask,
} = require("../../../../src/api/translate/controllers/create-helpers");
const { transformResult } = require("../../../../src/util/common");

// Require the controller factory function
const translateControllerFactory = require("../../../../src/api/translate/controllers/translate");

describe("Translate Controller: create method", () => {
  let ctx;
  let strapi;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // A mock Strapi object that the controller factory will receive
    strapi = {
      db: { query: jest.fn(() => ({ findOne: jest.fn() })) },
      log: { info: jest.fn(), error: jest.fn() },
      entityService: { findMany: jest.fn() },
    };

    // A mock Koa context object
    ctx = {
      request: {
        body: {
          signature: "test-signature",
          clientName: "test-client",
          data: { IMSI: "123456789012345" },
        },
      },
      state: { user: { id: 1, username: "test-user" } },
    };

    // Default successful mock implementations
    // @ts-ignore
    validateRequest.mockReturnValue({
      task: { getIMSI: () => "123456789012345" },
    });
    // @ts-ignore
    checkSubscription.mockResolvedValue({
      activeSubscription: { authSignature: false },
    });
    // @ts-ignore
    verifySignature.mockReturnValue(null);
    // @ts-ignore
    determineOperator.mockResolvedValue(undefined);
    // @ts-ignore
    processTask.mockResolvedValue(undefined);
    // @ts-ignore
    transformResult.mockReturnValue({ success: true });
  });

  it("should call helpers and return result on success", async () => {
    const controller = translateControllerFactory({ strapi });
    controller.validateQuery = jest.fn(); // Mock the method added by the real createCoreController

    // @ts-ignore
    const result = await controller.create(ctx);

    expect(controller.validateQuery).toHaveBeenCalledWith(ctx);
    expect(validateRequest).toHaveBeenCalledWith(ctx, false);
    expect(checkSubscription).toHaveBeenCalledWith(
      strapi,
      ctx.state.user,
      expect.any(Object),
      false,
    );
    expect(determineOperator).toHaveBeenCalledWith(
      strapi,
      expect.any(Object),
      expect.any(Object),
    );
    expect(processTask).toHaveBeenCalledWith(
      strapi,
      expect.any(Object),
      expect.any(Object),
      ctx.state.user,
    );
    expect(transformResult).toHaveBeenCalledWith(false, expect.any(Object));
    expect(result).toEqual({ success: true });
  });

  it("should call verifySignature when authSignature is active", async () => {
    // @ts-ignore
    checkSubscription.mockResolvedValue({
      activeSubscription: { authSignature: true },
    });
    const controller = translateControllerFactory({ strapi });
    controller.validateQuery = jest.fn();
    const { signature, ...body } = ctx.request.body;

    // @ts-ignore
    await controller.create(ctx);

    expect(verifySignature).toHaveBeenCalledWith(
      body,
      signature,
      expect.any(String), // privateKey is read from file, so it's a string
      expect.any(Object),
      false,
    );
  });

  it("should NOT call verifySignature when authSignature is inactive", async () => {
    const controller = translateControllerFactory({ strapi });
    controller.validateQuery = jest.fn();

    // @ts-ignore
    await controller.create(ctx);

    expect(verifySignature).not.toHaveBeenCalled();
  });

  it("should return an error if request validation fails", async () => {
    const validationError = { error: "Validation Failed" };
    // @ts-ignore
    validateRequest.mockReturnValue({ error: validationError });
    const controller = translateControllerFactory({ strapi });
    controller.validateQuery = jest.fn();

    // @ts-ignore
    const result = await controller.create(ctx);

    expect(result).toBe(validationError);
    expect(checkSubscription).not.toHaveBeenCalled();
  });

  it("should return an error if subscription check fails", async () => {
    const subscriptionError = { error: "Subscription Invalid" };
    // @ts-ignore
    checkSubscription.mockResolvedValue({ error: subscriptionError });
    const controller = translateControllerFactory({ strapi });
    controller.validateQuery = jest.fn();

    // @ts-ignore
    const result = await controller.create(ctx);

    expect(result).toBe(subscriptionError);
    expect(determineOperator).not.toHaveBeenCalled();
  });

  it("should return an error if signature verification fails", async () => {
    const signatureError = { error: "Signature Invalid" };
    // @ts-ignore
    checkSubscription.mockResolvedValue({
      activeSubscription: { authSignature: true },
    });
    // @ts-ignore
    verifySignature.mockReturnValue(signatureError);
    const controller = translateControllerFactory({ strapi });
    controller.validateQuery = jest.fn();

    // @ts-ignore
    const result = await controller.create(ctx);

    expect(result).toBe(signatureError);
    expect(determineOperator).not.toHaveBeenCalled();
  });
});

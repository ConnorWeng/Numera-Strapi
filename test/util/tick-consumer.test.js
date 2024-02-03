const TickConsumer = require("../../src/util/tick-consumer");

describe("TickConsumer", () => {
  let tickConsumer;
  let taskQueue;

  beforeEach(() => {
    taskQueue = {
      getTaskWithoutShift: jest.fn(),
      getTask: jest.fn(),
    };
    tickConsumer = TickConsumer.getInstance();
    tickConsumer.setTaskQueue(taskQueue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should consume a task if available processor is found", () => {
    jest.useFakeTimers();
    const testTask = { id: 1 };
    const processor = {
      isAvailable: jest.fn(() => true),
      isMatch: jest.fn(() => true),
      process: jest.fn(),
    };
    const processorPool = {
      findAvaiableProcessor: jest.fn(() => processor),
    };
    taskQueue.getTaskWithoutShift.mockReturnValue(testTask);
    taskQueue.getTask.mockReturnValue(testTask);
    tickConsumer.setProcessorPool(processorPool);
    tickConsumer.consume();
    jest.runAllTimers();
    expect(processor.process).toHaveBeenCalledWith(testTask);
  });

  test("should not consume a task if no available processor is found", () => {
    const testTask = { id: 1 };
    const processor = {
      isAvailable: jest.fn(() => false),
      isMatch: jest.fn(() => true),
      process: jest.fn(),
    };
    const processorPool = {
      findAvaiableProcessor: jest.fn(() => processor),
    };
    taskQueue.getTaskWithoutShift.mockReturnValue(testTask);
    tickConsumer.setProcessorPool(processorPool);
    tickConsumer.consume();
    expect(processor.process).not.toHaveBeenCalled();
  });

  test("should not consume a task if no matching processor is found", () => {
    const testTask = { id: 1 };
    const processor = {
      isAvailable: jest.fn(() => true),
      isMatch: jest.fn(() => false),
      process: jest.fn(),
    };
    const processorPool = {
      findAvaiableProcessor: jest.fn(() => processor),
    };
    taskQueue.getTaskWithoutShift.mockReturnValue(testTask);
    tickConsumer.setProcessorPool(processorPool);
    tickConsumer.consume();
    expect(processor.process).not.toHaveBeenCalled();
  });

  test("should start consuming tasks at regular intervals", () => {
    jest.useFakeTimers();
    tickConsumer.consume = jest.fn();
    tickConsumer.start();
    jest.advanceTimersByTime(1000);
    expect(tickConsumer.consume).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(tickConsumer.consume).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1000);
    expect(tickConsumer.consume).toHaveBeenCalledTimes(3);
    jest.clearAllTimers();
  });
});

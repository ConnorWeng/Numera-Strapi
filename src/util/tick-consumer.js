class TickConsumer {
  static instance;

  constructor() {
    if (TickConsumer.instance) {
      return TickConsumer.instance;
    }

    this.taskQueue = null;
    this.processorPool = null;

    TickConsumer.instance = this;
  }

  setTaskQueue(taskQueue) {
    this.taskQueue = taskQueue;
  }

  setProcessorPool(processorPool) {
    this.processorPool = processorPool;
  }

  getProcessorPool() {
    return this.processorPool;
  }

  consume() {
    const task = this.taskQueue.getTask();
    if (task) {
      const processor = this.processorPool.findAvaiableProcessor(task);
      if (processor) {
        setTimeout(() => {
          processor.process(task);
        }, 0);
      }
    }
  }

  start() {
    if (!this.taskQueue) {
      throw new Error("Task queue is not set");
    }
    if (!this.processorPool) {
      throw new Error("Processor pool is not set");
    }
    setInterval(() => {
      this.consume();
    }, 1000);
  }

  static getInstance() {
    if (!TickConsumer.instance) {
      TickConsumer.instance = new TickConsumer();
    }
    return TickConsumer.instance;
  }
}

module.exports = TickConsumer;

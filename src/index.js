'use strict';

const TaskQueue = require('./util/task-queue');
const TickConsumer = require('./util/tick-consumer');
const DeviceService = require('./api/device/services/device');
const ProcessorPool = require('./util/processor-pool');

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    const globalTickConsumer = TickConsumer.getInstance();

    const globalTaskQueue = TaskQueue.getInstance();
    globalTickConsumer.setTaskQueue(globalTaskQueue);

    const processorPool = await ProcessorPool.createNewProcessorPoolFromDB(strapi);
    globalTickConsumer.setProcessorPool(processorPool);

    globalTickConsumer.start();
  },
};

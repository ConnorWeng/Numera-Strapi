'use strict';

const TaskQueue = require('./util/task-queue');
const TickConsumer = require('./util/tick-consumer');

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
  bootstrap(/*{ strapi }*/) {
    const globalTaskQueue = TaskQueue.getInstance();
    const globalTickConsumer = TickConsumer.getInstance();
    globalTickConsumer.setTaskQueue(globalTaskQueue);
    globalTickConsumer.start();
  },
};

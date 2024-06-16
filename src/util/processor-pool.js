const CMCCProcessor = require("./cmcc-processor");
const CUCCProcessor = require("./cucc-processor");
const FORProcessor = require("./for-processor");

class ProcessorPool {
  constructor(processors) {
    this.processors = processors || [];
  }

  addProcessor(processor) {
    this.processors.push(processor);
  }

  findAvaiableProcessor(task) {
    const availableProcessor = this.processors.find(
      (processor) => processor.isAvailable() && processor.isMatch(task),
    );
    const unavailableProcessor = this.processors.find(
      (processor) => !processor.isAvailable(),
    );

    // Make sure only one processor is running globally
    if (availableProcessor && !unavailableProcessor) {
      return availableProcessor;
    } else {
      return null;
    }
  }

  static async createNewProcessorPoolFromDB(strapi) {
    const devices = await strapi.db.query("api::device.device").findMany({
      populate: { subdevice: true },
      pagination: { pageSize: 1000 },
    });
    const processors = devices
      .filter((device) => device.type === "calling")
      .map((device) => {
        if (device.operator === "CMCC") {
          return new CMCCProcessor(device);
        } else if (device.operator === "CUCC") {
          return new CUCCProcessor(device);
        }
      });
    const pool = new ProcessorPool(processors);
    const forProcessor = new FORProcessor(pool);
    pool.addProcessor(forProcessor);
    return pool;
  }
}

module.exports = ProcessorPool;

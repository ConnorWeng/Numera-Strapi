const CMCCProcessor = require("./cmcc-processor");
const CUCCProcessor = require("./cucc-processor");
const FORProcessor = require("./for-processor");
const BorderProcessor = require("./border-processor");

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
    if (availableProcessor) {
      return availableProcessor;
    } else {
      return null;
    }
  }

  moveProcessorToEnd(processor) {
    const index = this.processors.indexOf(processor);
    if (index > -1) {
      this.processors.splice(index, 1);
      this.processors.push(processor);
    }
  }

  static async createNewProcessorPoolFromDB(strapi) {
    const devices = await strapi.db.query("api::device.device").findMany({
      populate: { subdevice: true },
      pagination: { pageSize: 1000 },
      orderBy: { order: "asc" },
    });
    const processors = devices
      .filter((device) => device.type === "calling" && !!device.publishedAt)
      .map((device) => {
        if (device.operator === "CMCC") {
          return new CMCCProcessor(device);
        } else if (device.operator === "CUCC") {
          return new CUCCProcessor(device);
        } else if (device.operator === "BORDER") {
          return new BorderProcessor(device);
        }
      });
    const pool = new ProcessorPool(processors);
    const forProcessor = new FORProcessor(pool);
    pool.addProcessor(forProcessor);

    processors.forEach((processor) => {
      processor.setPool(pool);
    });
    forProcessor.setPool(pool);

    return pool;
  }
}

module.exports = ProcessorPool;

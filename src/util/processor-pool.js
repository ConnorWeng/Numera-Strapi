const TDSProcessor = require("./tds-processor");
const GSMProcessor = require("./gsm-processor");

class ProcessorPool {
  constructor(processors) {
    this.processors = processors || [];
  }

  addProcessor(processor) {
    this.processors.push(processor);
  }

  findAvaiableProcessor(task) {
    return this.processors.find(
      (processor) => processor.isAvailable() && processor.isMatch(task),
    );
  }

  static async createNewProcessorPoolFromDB(strapi) {
    const devices = await strapi.db.query("api::device.device").findMany({
      pagination: { pageSize: 1000 },
    });
    const processors = devices.map((device) => {
      if (device.operator === "TDS") {
        return new TDSProcessor(device);
      } else if (device.operator === "GSM") {
        return new GSMProcessor(device);
      }
    });
    const processorPool = new ProcessorPool(processors);
    return processorPool;
  }
}

module.exports = ProcessorPool;

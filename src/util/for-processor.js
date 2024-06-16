const TranslateTask = require("./task");

const Processor = require("./processor");

class FORProcessor extends Processor {
  constructor(processorPool) {
    super({
      apiToken: "fake",
    });
    this.processorPool = processorPool;
  }

  isMatch(task) {
    return task.getOperator() === "FOR";
  }

  async process(task) {
    strapi.log.info(
      `Start processing ${this.constructor.name} task: ${JSON.stringify(task)}`,
    );
    const derivedCMCCTask = this.cloneTask(task, "CMCC");
    this.keepFindingProcessorToProcess(derivedCMCCTask, task);
    const derivedCUCCTask = this.cloneTask(task, "CUCC");
    this.keepFindingProcessorToProcess(derivedCUCCTask, task);
  }

  keepFindingProcessorToProcess(derivedTask, originTask) {
    const processor = this.processorPool.findAvaiableProcessor(derivedTask);
    if (processor) {
      derivedTask.take();
      setTimeout(() => {
        processor.process(derivedTask);
      }, 0);
    } else {
      if (!originTask.isDone()) {
        setTimeout(() => {
          this.keepFindingProcessorToProcess(derivedTask);
        }, 1000);
      }
    }
  }

  cloneTask(task, operator) {
    const newTask = new TranslateTask(task.IMSI);
    newTask.uid = task.uid;
    newTask.operator = operator;
    newTask.derived = true;
    return newTask;
  }
}

module.exports = FORProcessor;

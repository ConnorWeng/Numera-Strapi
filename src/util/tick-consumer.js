class TickConsumer {
    static instance;

    constructor() {
        if (TickConsumer.instance) {
            return TickConsumer.instance;
        }

        this.taskQueue = null;
        this.processorSlots = [];

        TickConsumer.instance = this;
    }

    setTaskQueue(taskQueue) {
        this.taskQueue = taskQueue;
    }

    addProcessor(processor) {
        this.processorSlots.push(processor);
    }

    consume() {
        const testTask = this.taskQueue.getTaskWithoutShift();
        if (testTask) {
            for (let i = 0; i < this.processorSlots.length; i++) {
                const processor = this.processorSlots[i];
                if (processor.isAvailable() && processor.isMatch(testTask)) {
                    const task = this.taskQueue.getTask();
                    setTimeout(() => {
                        processor.process(task);
                    }, 1000);
                    break;
                }
            }
        }
    }

    start() {
        if (!this.taskQueue) {
            throw new Error('Task queue is not set');
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
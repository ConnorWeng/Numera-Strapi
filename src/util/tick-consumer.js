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
        const testTask = this.taskQueue.getTaskWithoutShift();
        if (testTask) {
            const processor = this.processorPool.findAvaiableProcessor(testTask);
            if (processor) {
                const task = this.taskQueue.getTask();
                setTimeout(() => {
                    processor.process(task);
                }, 1000);
            }
        }
    }

    start() {
        if (!this.taskQueue) {
            throw new Error('Task queue is not set');
        }
        if (!this.processorPool) {
            throw new Error('Processor pool is not set');
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
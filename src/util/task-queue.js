class TaskQueue {
    static instance;

    constructor() {
        if (TaskQueue.instance) {
            return TaskQueue.instance;
        }

        this.queue = [];
        TaskQueue.instance = this;
    }

    addTask(task) {
        this.queue.push(task);
    }

    getTask() {
        return this.queue.shift();
    }

    getTaskWithoutShift() {
        return this.queue.length > 0 ? this.queue[0] : null;
    }

    static getInstance() {
        if (!TaskQueue.instance) {
            TaskQueue.instance = new TaskQueue();
        }
        return TaskQueue.instance;
    }
}

module.exports = TaskQueue;
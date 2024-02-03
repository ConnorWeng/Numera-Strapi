class Processor {
    constructor() {
        this.available = true;
    }

    isAvailable() {
        return this.available;
    }

    isMatch(task) {
        return true;
    }

    process(task) {
        this.available = false;
    }
}

module.exports = Processor;
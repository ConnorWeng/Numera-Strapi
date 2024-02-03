class Processor {
  constructor(device) {
    this.available = true;
    this.device = device;
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

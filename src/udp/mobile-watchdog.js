const { exec } = require("child_process");

class MobileWatchdog {
  constructor(mobileNo, timeout = 300000) {
    this.mobileNo = mobileNo;
    this.timeout = timeout;
    this.lastFeed = Date.now();
    this.timer = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFeed = Date.now();
    this.startTimer();
    strapi.log.info(`dog-${this.mobileNo} started watching`);
  }

  feed() {
    this.lastFeed = Date.now();
    strapi.log.info(`dog-${this.mobileNo} feeded`);
  }

  startTimer() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      const timeSinceLastFeed = Date.now() - this.lastFeed;
      if (timeSinceLastFeed > this.timeout) {
        this.kill();
      }
    }, 1000); // Check every second
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    strapi.log.info(`dog-${this.mobileNo} stoped watching`);
  }

  kill() {
    strapi.log.info(`dog-${this.mobileNo} timeout - killing process`);
    const findcmd = `pgrep -f "mobile ${this.mobileNo}"`;
    strapi.log.info(`Find mobile with cmd: ${findcmd}`);
    exec(findcmd, (error, stdout, stderr) => {
      if (error) {
        strapi.log.error(`Error when exec shell: ${error}`);
        return;
      }
      if (stdout) {
        strapi.log.info(`Find mobile stdout: ${stdout}`);
        const parts = stdout.split("\n");
        if (parts.length > 1) {
          const killcmd = `kill -9 ${parts[0]}; kill -9 ${parts[1]}`;
          strapi.log.info(`Kill with cmd: ${killcmd}`);
          exec(killcmd, (error, stdout, stderr) => {
            if (error) {
              strapi.log.error(`Error when kill: ${error}`);
              return;
            }
            strapi.log.info(`Kill process ${stdout}`);
          });
        }
      }
    });
    this.feed();
  }
}

module.exports = MobileWatchdog;

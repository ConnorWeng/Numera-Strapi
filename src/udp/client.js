"use strict";

const dgram = require("dgram");

class UDPClient {
  static instance;

  constructor() {
    if (UDPClient.instance) {
      return UDPClient.instance;
    }

    this.client = dgram.createSocket("udp4");
    UDPClient.instance = this;
  }

  send(buffer, port, address) {
    this.client.send(buffer, 0, buffer.length, port, address, (err) => {
      if (err) {
        strapi.log.error("Error sending UDP message:", err);
      } else {
        strapi.log.info(
          "UDP message sent successfully, length: " + buffer.length,
        );
      }
    });
  }

  close() {
    this.client.close();
  }

  static getInstance() {
    if (!UDPClient.instance) {
      UDPClient.instance = new UDPClient();
    }
    return UDPClient.instance;
  }
}

module.exports = UDPClient;

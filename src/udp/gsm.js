const fs = require("fs");
const path = require("path");
const wav = require("node-wav");
/* const { RPE_LTP_Decoder } = require("gsm-official-library"); // Replace with the actual GSM library */

const taskCallMap = new Map();
let intervalStarted = false;

function parseFrameNumber(callData) {
  if (callData.length < 37) {
    throw new Error("Invalid callData length. Expected at least 37 bytes.");
  }

  // Extract the 32-bit frame number from callData[33]-callData[36]
  const frameNumber =
    (callData[33] << 24) | // High byte
    (callData[34] << 16) |
    (callData[35] << 8) |
    callData[36]; // Low byte

  return frameNumber;
}

function decodeGSM(callData) {
  /* const decoder = new RPE_LTP_Decoder();
  const pcmData = decoder.decode(callData);
  return pcmData; */
  return null;
}

function writeDataToWavFile(calls, taskKey) {
  const pcmData = [];

  for (const call of calls) {
    try {
      const decodedPCM = decodeGSM(call.callData.slice(0, 33)); // Decode callData[0]-callData[32]
      pcmData.push(...decodedPCM);
    } catch (error) {
      strapi.log.error(
        `Failed to decode callData for task ${taskKey}: ${error.message}`,
      );
    }
  }

  // Create a WAV file from the PCM data
}

function startTaskCleanupInterval() {
  if (intervalStarted) return;
  intervalStarted = true;

  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of taskCallMap.entries()) {
      if (now - value.lastUpdated > 5000) {
        // 5 seconds
        strapi.log.info(
          `Task ${key} has not been updated for over 5 seconds. Cleaning up.`,
        );

        try {
          // Sort calls by frameNumber
          const sortedCalls = value.calls.sort((a, b) => {
            const frameA = parseFrameNumber(a.callData);
            const frameB = parseFrameNumber(b.callData);
            return frameA - frameB;
          });

          strapi.log.info(
            `Sorted calls for task ${key} by frame number. ${JSON.stringify(sortedCalls)}`,
          );

          // Write sorted PCM data to a WAV file
          writeDataToWavFile(sortedCalls, key);
        } catch (error) {
          strapi.log.error(
            `Failed to process calls for task ${key}: ${error.message}`,
          );
        }

        taskCallMap.delete(key);
      }
    }
  }, 1000); // Check every second
}

function handleGSM(call, task, udpClient, server) {
  const currentTime = Date.now();

  // Check if the task already exists in the map
  if (taskCallMap.has(task)) {
    const taskEntry = taskCallMap.get(task);
    taskEntry.calls.push(call); // Add the new call to the existing array
    taskEntry.lastUpdated = currentTime; // Update the timestamp
  } else {
    // Create a new entry with the call in an array
    taskCallMap.set(task, { calls: [call], lastUpdated: currentTime });
  }

  // Start the cleanup interval if not already started
  startTaskCleanupInterval();
}

module.exports = {
  handleGSM,
};

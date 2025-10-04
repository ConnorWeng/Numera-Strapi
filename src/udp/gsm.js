const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

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

const GSM_FRAME_SIZE = 33; // 33 bytes for GSM RPE-LTP full-rate
const untoastPath = "/root/gsm-1.0-pl22/bin/untoast";

async function decodeGSM(calls) {
  let allPcmData = Buffer.alloc(0);

  for (const [index, item] of calls.entries()) {
    if (
      item.callData &&
      Array.isArray(item.callData) &&
      item.callData.length >= GSM_FRAME_SIZE
    ) {
      const gsmPacket = Buffer.from(item.callData.slice(0, GSM_FRAME_SIZE));

      try {
        // 1. Decode the .gsm data to raw PCM using 'untoast' via stdin/stdout
        const pcmData = await new Promise((resolve, reject) => {
          const untoastProcess = spawn(untoastPath, []);
          let rawPcmBuffer = Buffer.alloc(0);

          untoastProcess.stdout.on("data", (data) => {
            rawPcmBuffer = Buffer.concat([rawPcmBuffer, data]);
          });

          untoastProcess.stderr.on("data", (data) => {
            strapi.log.error(`untoast stderr for item ${index}: ${data}`);
          });

          untoastProcess.on("close", (code) => {
            if (code === 0) {
              resolve(rawPcmBuffer);
            } else {
              reject(
                new Error(
                  `untoast process exited with code ${code} for item ${index}`,
                ),
              );
            }
          });

          untoastProcess.stdin.write(gsmPacket);
          untoastProcess.stdin.end();
        });

        if (pcmData && pcmData.length > 0) {
          allPcmData = Buffer.concat([allPcmData, pcmData]);
        }
      } catch (error) {
        strapi.log.error(`Error processing item ${index}:`, error.message);
      }
    } else {
      strapi.log.warn(
        `Item ${index} does not contain a valid 'callData' array of sufficient length.`,
      );
    }
  }

  strapi.log.info(`Decoded total PCM data length: ${allPcmData.length} bytes`);
  return allPcmData;
}

async function writeDataToWavFile(calls) {
  const allPcmData = await decodeGSM(calls);
  if (allPcmData.length > 0) {
    const tempCombinedRawFile = path.join(__dirname, "temp_combined.raw");
    // Convert Buffer to Uint8Array to satisfy type expectations of fs.writeFileSync
    fs.writeFileSync(tempCombinedRawFile, Uint8Array.from(allPcmData));

    // TODO：Create a WAV file from the PCM data
  }
}

function startTaskCleanupInterval() {
  if (intervalStarted) return;
  intervalStarted = true;

  setInterval(async () => {
    const now = Date.now();
    for (const [key, value] of taskCallMap.entries()) {
      if (now - value.lastUpdated > 5000) {
        // 5 seconds
        strapi.log.info(
          `Task ${key.uid} has not been updated for over 5 seconds. Cleaning up. Calls length: ${value.calls.length}`,
        );

        try {
          // Sort calls by frameNumber
          const sortedCalls = value.calls
            .filter((call) => {
              return call.callData && call.callData.length >= 37;
            })
            .sort((a, b) => {
              const frameA = parseFrameNumber(a.callData);
              const frameB = parseFrameNumber(b.callData);
              return frameA - frameB;
            });

          strapi.log.info(
            `Sorted calls for task ${key.uid} by frame number. Frames length: ${sortedCalls.length}`,
          );

          // Write sorted PCM data to a WAV file
          await writeDataToWavFile(sortedCalls);
        } catch (error) {
          strapi.log.error(
            `Failed to process calls for task ${key.uid}: ${error.message}`,
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

'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function calculateFileSha256(filePath) {
  const hash = createHash('sha256');
  const fileDescriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fileDescriptor);
  }

  return hash.digest('hex');
}

function assertFileSha256(filePath, expectedSha256) {
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error(
      `Invalid FFmpeg archive SHA256 for ${path.basename(filePath)}: ${JSON.stringify(expectedSha256)}`,
    );
  }

  const actualSha256 = calculateFileSha256(filePath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `FFmpeg archive checksum mismatch for ${path.basename(filePath)}: ` +
        `expected ${expectedSha256}, actual ${actualSha256}`,
    );
  }
}

module.exports = {
  assertFileSha256,
};

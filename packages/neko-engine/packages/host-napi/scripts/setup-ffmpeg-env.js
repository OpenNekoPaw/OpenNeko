#!/usr/bin/env node
'use strict';

const { createBuildEnv, formatMissingFfmpegMessage, resolveFfmpegEnv } = require('../../../scripts/ffmpeg-env');

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};

/**
 * @param {string} message
 * @param {'green' | 'yellow' | 'red' | 'reset'} [color]
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function main() {
  log('\nFFmpeg Environment Setup', 'green');
  log('========================\n');

  const resolved = resolveFfmpegEnv();
  if (!resolved) {
    log(formatMissingFfmpegMessage(), 'red');
    process.exitCode = 1;
    return;
  }

  const env = createBuildEnv(process.env, resolved);
  log(`Resolved FFmpeg from ${resolved.source}: ${resolved.ffmpegDir}`, 'green');
  log(`FFMPEG_DIR=${env.FFMPEG_DIR}`, 'yellow');

  if (env.PKG_CONFIG_PATH) {
    log(`PKG_CONFIG_PATH=${env.PKG_CONFIG_PATH}`, 'yellow');
  }

  log('\nEnvironment can be used by build scripts through run-with-ffmpeg-env.js\n', 'green');
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};

#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const { createBuildEnv, formatMissingFfmpegMessage, resolveFfmpegEnv } = require('./ffmpeg-env');

/**
 * @param {string[]} argv
 * @returns {{ command: string[] }}
 */
function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const command = separatorIndex === -1 ? argv : argv.slice(separatorIndex + 1);

  return {
    command,
  };
}

/**
 * @param {string[]} [argv]
 */
function main(argv = process.argv.slice(2)) {
  const { command } = parseArgs(argv);
  if (command.length === 0) {
    throw new Error('Expected a command to run after `--`.');
  }

  const resolved = resolveFfmpegEnv();
  if (!resolved) {
    console.error(formatMissingFfmpegMessage());
    process.exitCode = 1;
    return;
  }

  console.log(`[ffmpeg] Using ${resolved.ffmpegDir} (${resolved.source})`);
  const result = spawnSync(command[0], command.slice(1), {
    env: createBuildEnv(process.env, resolved),
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseArgs,
};

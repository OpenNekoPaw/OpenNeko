#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createBuildEnv, formatMissingFfmpegMessage, resolveFfmpegEnv } = require('./ffmpeg-env');

function parseArgs(argv) {
  return {
    release: argv.includes('--release'),
  };
}

function runCommand(command, args, options) {
  const result = options.spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === 'win32',
    stdio: options.stdio,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main(argv = process.argv.slice(2), dependencies = {}) {
  const cwd = dependencies.cwd ?? process.cwd();
  const spawnSyncImpl = dependencies.spawnSync ?? spawnSync;
  const resolve = dependencies.resolveFfmpegEnv ?? resolveFfmpegEnv;
  const createEnv = dependencies.createBuildEnv ?? createBuildEnv;
  const resolved = resolve();

  if (!resolved) {
    console.error(formatMissingFfmpegMessage());
    return 1;
  }

  process.stdout.write(`[ffmpeg] Using ${resolved.ffmpegDir} (${resolved.source})\n`);
  const env = createEnv(process.env, resolved);
  const metadataStatus = runCommand(
    'cargo',
    [
      'metadata',
      '--locked',
      '--format-version',
      '1',
      '--manifest-path',
      path.join(cwd, 'Cargo.toml'),
    ],
    {
      cwd,
      env,
      spawnSync: spawnSyncImpl,
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  if (metadataStatus !== 0) {
    return metadataStatus;
  }

  const napiArgs = ['exec', 'napi', 'build', '--platform'];
  if (parseArgs(argv).release) {
    napiArgs.push('--release');
  }

  const napiStatus = runCommand('pnpm', napiArgs, {
    cwd,
    env,
    spawnSync: spawnSyncImpl,
    stdio: 'inherit',
  });
  return napiStatus;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseArgs,
  runCommand,
};

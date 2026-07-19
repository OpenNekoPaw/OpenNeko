#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { copyFileSync } = require('node:fs');

const { createBuildEnv, formatMissingFfmpegMessage, resolveFfmpegEnv } = require('./ffmpeg-env');
const {
  getCurrentPlatformKey,
  getSupportedTargets,
  getTargetByRustTriple,
  getTargetConfig,
} = require('./package-config');

function parseArgs(argv) {
  const targetIndex = argv.indexOf('--target');
  const rustTarget = targetIndex === -1 ? null : argv[targetIndex + 1] ?? null;
  if (targetIndex !== -1 && !rustTarget) {
    throw new Error('--target requires a Rust target triple.');
  }

  return {
    release: argv.includes('--release'),
    rustTarget,
  };
}

function resolveBuildTarget(args, currentPlatformKey) {
  if (args.rustTarget) {
    const target = getTargetByRustTriple(args.rustTarget);
    if (!target) {
      throw new Error(
        `Unsupported Rust target "${args.rustTarget}". Supported targets: ${getSupportedTargets().join(', ')}.`,
      );
    }
    return target;
  }

  if (!getTargetConfig(currentPlatformKey)) {
    throw new Error(
      `Unsupported build host "${currentPlatformKey}". Supported targets: ${getSupportedTargets().join(', ')}.`,
    );
  }

  return currentPlatformKey;
}

function restoreCanonicalLoader(cwd, copy = copyFileSync) {
  copy(path.join(cwd, 'loader.js'), path.join(cwd, 'index.js'));
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
  const restoreLoader = dependencies.restoreCanonicalLoader ?? restoreCanonicalLoader;
  const args = parseArgs(argv);
  resolveBuildTarget(args, dependencies.currentPlatformKey ?? getCurrentPlatformKey());
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
  if (args.release) {
    napiArgs.push('--release');
  }
  if (args.rustTarget) {
    napiArgs.push('--target', args.rustTarget);
  }

  const napiStatus = runCommand('pnpm', napiArgs, {
    cwd,
    env,
    spawnSync: spawnSyncImpl,
    stdio: 'inherit',
  });
  if (napiStatus === 0) {
    restoreLoader(cwd);
  }
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
  resolveBuildTarget,
  restoreCanonicalLoader,
  runCommand,
};

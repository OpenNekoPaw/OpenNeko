'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  main,
  parseArgs,
  resolveBuildTarget,
  restoreCanonicalLoader,
} = require('./build-napi');

test('N-API build preflights Cargo metadata with visible stderr', () => {
  const calls = [];
  const spawnSync = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  };

  const status = main(['--release', '--target', 'aarch64-apple-darwin'], {
    cwd: '/tmp/neko-engine/host-napi',
    resolveFfmpegEnv: () => ({
      ffmpegDir: '/opt/homebrew/opt/ffmpeg',
      pkgConfigPath: '/opt/homebrew/opt/ffmpeg/lib/pkgconfig',
      source: 'pkg-config',
    }),
    createBuildEnv: (baseEnv, resolved) => ({ ...baseEnv, FFMPEG_DIR: resolved.ffmpegDir }),
    currentPlatformKey: 'darwin-arm64',
    restoreCanonicalLoader(cwd) {
      calls.push({ command: 'restore-loader', args: [cwd], options: {} });
    },
    spawnSync,
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args, [
    'metadata',
    '--locked',
    '--format-version',
    '1',
    '--manifest-path',
    '/tmp/neko-engine/host-napi/Cargo.toml',
  ]);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'ignore', 'inherit']);
  assert.deepEqual(calls[1].args, [
    'exec',
    'napi',
    'build',
    '--platform',
    '--release',
    '--target',
    'aarch64-apple-darwin',
  ]);
  assert.equal(calls[1].options.stdio, 'inherit');
  assert.deepEqual(calls[2], {
    command: 'restore-loader',
    args: ['/tmp/neko-engine/host-napi'],
    options: {},
  });
});

test('N-API build forwards supported Rust targets and rejects all others', () => {
  assert.throws(() => parseArgs(['--target']), /requires a Rust target triple/u);
  assert.equal(
    resolveBuildTarget({ release: true, rustTarget: 'aarch64-apple-darwin' }, 'linux-arm64'),
    'darwin-arm64',
  );
  assert.throws(
    () => resolveBuildTarget({ release: true, rustTarget: 'x86_64-apple-darwin' }, 'darwin-arm64'),
    /Unsupported Rust target/u,
  );
  assert.throws(
    () => resolveBuildTarget({ release: false, rustTarget: null }, 'linux-arm64'),
    /Unsupported build host/u,
  );
});

test('N-API build restores the canonical loader after code generation', () => {
  const copies = [];
  restoreCanonicalLoader('/tmp/neko-engine/host-napi', (source, destination) => {
    copies.push({ source, destination });
  });

  assert.deepEqual(copies, [
    {
      source: '/tmp/neko-engine/host-napi/loader.js',
      destination: '/tmp/neko-engine/host-napi/index.js',
    },
  ]);
});

test('N-API build stops before compilation when Cargo metadata fails', () => {
  const calls = [];
  const status = main([], {
    cwd: '/tmp/neko-engine/host-napi',
    resolveFfmpegEnv: () => ({
      ffmpegDir: '/opt/homebrew/opt/ffmpeg',
      pkgConfigPath: null,
      source: 'environment',
    }),
    createBuildEnv: (baseEnv) => baseEnv,
    currentPlatformKey: 'linux-x64',
    spawnSync: (command, args) => {
      calls.push({ command, args });
      return { status: 17 };
    },
  });

  assert.equal(status, 17);
  assert.deepEqual(calls, [
    {
      command: 'cargo',
      args: [
        'metadata',
        '--locked',
        '--format-version',
        '1',
        '--manifest-path',
        '/tmp/neko-engine/host-napi/Cargo.toml',
      ],
    },
  ]);
});

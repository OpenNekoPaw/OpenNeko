'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { main } = require('./build-napi');

test('N-API build preflights Cargo metadata with visible stderr', () => {
  const calls = [];
  const spawnSync = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0 };
  };

  const status = main(['--release'], {
    cwd: '/tmp/neko-engine/host-napi',
    resolveFfmpegEnv: () => ({
      ffmpegDir: '/opt/homebrew/opt/ffmpeg',
      pkgConfigPath: '/opt/homebrew/opt/ffmpeg/lib/pkgconfig',
      source: 'pkg-config',
    }),
    createBuildEnv: (baseEnv, resolved) => ({ ...baseEnv, FFMPEG_DIR: resolved.ffmpegDir }),
    spawnSync,
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args, [
    'metadata',
    '--locked',
    '--format-version',
    '1',
    '--manifest-path',
    '/tmp/neko-engine/host-napi/Cargo.toml',
  ]);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'ignore', 'inherit']);
  assert.deepEqual(calls[1].args, ['exec', 'napi', 'build', '--platform', '--release']);
  assert.equal(calls[1].options.stdio, 'inherit');
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

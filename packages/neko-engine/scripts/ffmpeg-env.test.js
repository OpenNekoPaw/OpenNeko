'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');

const { DEPS_DIR } = require('./package-config');
const { createBuildEnv, getSearchCandidates, resolveFfmpegEnv } = require('./ffmpeg-env');

test('resolveFfmpegEnv prefers pkg-config/system FFmpeg over workspace dev libraries', () => {
  const workspaceDir = path.join(DEPS_DIR, 'ffmpeg');
  const pkgConfigDir = '/opt/homebrew/Cellar/ffmpeg/8.0.1_4';
  const existing = new Set([
    path.join(workspaceDir, 'include', 'libavutil', 'avutil.h'),
    path.join(workspaceDir, 'lib'),
    path.join(workspaceDir, 'lib', 'pkgconfig'),
    path.join(pkgConfigDir, 'include', 'libavutil', 'avutil.h'),
    path.join(pkgConfigDir, 'lib'),
    path.join(pkgConfigDir, 'lib', 'pkgconfig'),
  ]);

  const resolved = resolveFfmpegEnv({
    env: {},
    platform: 'darwin',
    platformKey: 'darwin-arm64',
    existsSync(filePath) {
      return existing.has(filePath);
    },
    execFileSync() {
      return `${pkgConfigDir}\n`;
    },
  });

  assert.deepEqual(resolved, {
    ffmpegDir: pkgConfigDir,
    pkgConfigPath: path.join(pkgConfigDir, 'lib', 'pkgconfig'),
    source: 'pkg-config',
  });
});

test('resolveFfmpegEnv falls back to Homebrew when workspace deps are missing', () => {
  const brewPrefix = '/opt/homebrew/opt/ffmpeg';
  const existing = new Set([
    path.join(brewPrefix, 'include', 'libavutil', 'avutil.h'),
    path.join(brewPrefix, 'lib'),
    path.join(brewPrefix, 'lib', 'pkgconfig'),
  ]);

  const resolved = resolveFfmpegEnv({
    env: {},
    platform: 'darwin',
    platformKey: 'darwin-arm64',
    existsSync(filePath) {
      return existing.has(filePath);
    },
    execFileSync() {
      return '';
    },
  });

  assert.deepEqual(resolved, {
    ffmpegDir: brewPrefix,
    pkgConfigPath: path.join(brewPrefix, 'lib', 'pkgconfig'),
    source: 'homebrew-dev',
  });
});

test('resolveFfmpegEnv rejects deferred Windows before probing local installs', () => {
  let probed = false;
  assert.throws(
    () =>
      resolveFfmpegEnv({
        env: { FFMPEG_DIR: 'C:\\ffmpeg' },
        platform: 'win32',
        platformKey: 'win32-x64',
        existsSync() {
          probed = true;
          throw new Error('unsupported platform reached filesystem probing');
        },
        execFileSync() {
          probed = true;
          throw new Error('unsupported platform reached command probing');
        },
      }),
    /Unsupported FFmpeg build platform "win32-x64".*darwin-arm64, linux-x64/u,
  );
  assert.equal(probed, false);
});

test('resolveFfmpegEnv accepts Ubuntu multiarch FFmpeg dev package layout', () => {
  const systemPrefix = '/usr';
  const existing = new Set([
    path.join(systemPrefix, 'include', 'x86_64-linux-gnu', 'libavutil', 'avutil.h'),
    path.join(systemPrefix, 'lib', 'x86_64-linux-gnu'),
    path.join(systemPrefix, 'lib', 'x86_64-linux-gnu', 'pkgconfig'),
  ]);

  const resolved = resolveFfmpegEnv({
    env: {},
    platform: 'linux',
    platformKey: 'linux-x64',
    existsSync(filePath) {
      return existing.has(filePath);
    },
    execFileSync() {
      return '';
    },
  });

  assert.deepEqual(resolved, {
    ffmpegDir: systemPrefix,
    pkgConfigPath: path.join(systemPrefix, 'lib', 'x86_64-linux-gnu', 'pkgconfig'),
    source: 'system',
  });
});

test('createBuildEnv prepends pkg-config path without discarding the existing value', () => {
  const env = createBuildEnv(
    {
      PATH: '/usr/bin',
      PKG_CONFIG_PATH: '/existing/pkgconfig',
    },
    {
      ffmpegDir: '/opt/homebrew/opt/ffmpeg',
      pkgConfigPath: '/opt/homebrew/opt/ffmpeg/lib/pkgconfig',
      source: 'homebrew-dev',
    },
  );

  assert.equal(env.FFMPEG_DIR, '/opt/homebrew/opt/ffmpeg');
  assert.equal(
    env.PKG_CONFIG_PATH,
    `/opt/homebrew/opt/ffmpeg/lib/pkgconfig${path.delimiter}/existing/pkgconfig`,
  );
});

test('createBuildEnv lets Ubuntu multiarch system packages use pkg-config discovery', () => {
  const env = createBuildEnv(
    {
      FFMPEG_DIR: '/stale/ffmpeg',
      PKG_CONFIG_PATH: '/existing/pkgconfig',
    },
    {
      ffmpegDir: '/usr',
      pkgConfigPath: '/usr/lib/x86_64-linux-gnu/pkgconfig',
      source: 'system',
    },
  );

  assert.equal(env.FFMPEG_DIR, undefined);
  assert.equal(
    env.PKG_CONFIG_PATH,
    `/usr/lib/x86_64-linux-gnu/pkgconfig${path.delimiter}/existing/pkgconfig`,
  );
});

test('getSearchCandidates keeps explicit environment override ahead of automatic fallbacks', () => {
  const candidates = getSearchCandidates({
    env: {
      FFMPEG_DIR: '/custom/ffmpeg',
    },
    platform: 'darwin',
    platformKey: 'darwin-arm64',
    execFileSync() {
      return '';
    },
  });

  assert.equal(candidates[0]?.path, '/custom/ffmpeg');
  assert.equal(candidates[0]?.source, 'environment');
});

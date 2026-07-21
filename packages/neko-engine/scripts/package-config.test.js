'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('path');

const {
  NAPI_DIR,
  config,
  getSupportedTargets,
  getTargetByRustTriple,
  getTargetConfig,
  resolveNodeBinaryPath,
} = require('./package-config');
const { setupPlatform } = require('./download-ffmpeg');

const ENGINE_ROOT = path.resolve(__dirname, '..');

test('package config resolves supported media engine targets', () => {
  assert.deepEqual(getSupportedTargets(), ['darwin-arm64', 'linux-x64']);
  assert.equal(getTargetConfig('darwin-arm64')?.ffmpeg.source, 'homebrew');
  assert.equal(getTargetConfig('linux-x64')?.ffmpeg.source, 'btbn');
  assert.equal(getTargetConfig('darwin-x64'), null);
  assert.equal(getTargetConfig('win32-x64'), null);
  assert.equal(getTargetByRustTriple('aarch64-apple-darwin'), 'darwin-arm64');
  assert.equal(getTargetByRustTriple('x86_64-apple-darwin'), null);
});

test('BtbN FFmpeg artifacts use immutable release identities and SHA256 digests', () => {
  assert.match(config.btbnTag, /^autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/u);

  for (const targetName of getSupportedTargets()) {
    const target = getTargetConfig(targetName);
    assert.ok(target);

    for (const artifact of [target.ffmpeg, target.ffmpegDev]) {
      if (!artifact || artifact.source !== 'btbn') {
        continue;
      }

      assert.match(artifact.archive, /^ffmpeg-.+\.tar\.xz$/u);
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/u);
      assert.doesNotMatch(artifact.archive, /latest/u);
    }
  }
});

test('package config rejects mutable BtbN release aliases before download', () => {
  const originalTag = config.btbnTag;
  config.btbnTag = 'latest';

  try {
    assert.throws(
      () => getTargetConfig('linux-x64'),
      /Invalid immutable BtbN release tag: "latest"/u,
    );
  } finally {
    config.btbnTag = originalTag;
  }
});

test('FFmpeg setup rejects unsupported platforms instead of skipping them', () => {
  assert.throws(
    () => setupPlatform('linux-arm64', { force: false }),
    /No ffmpegDev config for platform "linux-arm64"/u,
  );
});

test('package config resolves host-napi binary paths from the shared target map', () => {
  assert.equal(
    resolveNodeBinaryPath('darwin-arm64'),
    path.join(NAPI_DIR, 'neko-engine.darwin-arm64.node'),
  );
  assert.throws(() => resolveNodeBinaryPath('win32-x64'), /Unsupported target "win32-x64"/u);
});

test('package manifest localization placeholders exist in every package NLS bundle', () => {
  const manifestSource = fs.readFileSync(path.join(ENGINE_ROOT, 'package.json'), 'utf8');
  const localizationKeys = [
    ...new Set([...manifestSource.matchAll(/%([A-Za-z0-9_.-]+)%/g)].map((match) => match[1])),
  ];

  for (const bundleName of ['package.nls.json', 'package.nls.zh-cn.json']) {
    const bundle = JSON.parse(fs.readFileSync(path.join(ENGINE_ROOT, bundleName), 'utf8'));
    for (const localizationKey of localizationKeys) {
      assert.equal(
        typeof bundle[localizationKey],
        'string',
        `${bundleName} is missing ${localizationKey}`,
      );
    }
  }
});

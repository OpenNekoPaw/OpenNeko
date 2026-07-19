'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('path');

const {
  NAPI_DIR,
  getSupportedTargets,
  getTargetConfig,
  resolveNodeBinaryPath,
} = require('./package-config');

const ENGINE_ROOT = path.resolve(__dirname, '..');

test('package config resolves supported media engine targets', () => {
  assert.deepEqual(getSupportedTargets(), ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);
  assert.equal(getTargetConfig('darwin-arm64')?.ffmpeg.source, 'homebrew');
  assert.equal(getTargetConfig('linux-x64')?.ffmpeg.source, 'btbn');
});

test('package config resolves host-napi binary paths from the shared target map', () => {
  assert.equal(
    resolveNodeBinaryPath('darwin-arm64'),
    path.join(NAPI_DIR, 'neko-engine.darwin-arm64.node'),
  );
  assert.equal(
    resolveNodeBinaryPath('win32-x64'),
    path.join(NAPI_DIR, 'neko-engine.win32-x64-msvc.node'),
  );
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

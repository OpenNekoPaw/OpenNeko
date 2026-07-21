'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SUPPORTED_TARGET_NAMES,
  loadNativeBinding,
  resolveBinding,
} = require('../packages/host-napi/native-binding-loader');

test('native binding loader exposes exactly the supported release targets', () => {
  assert.deepEqual(SUPPORTED_TARGET_NAMES, ['darwin-arm64', 'linux-x64']);
  assert.deepEqual(resolveBinding('darwin', 'arm64'), {
    target: 'darwin-arm64',
    localFile: 'neko-engine.darwin-arm64.node',
    packageName: '@neko-engine/host-napi-darwin-arm64',
  });
  assert.deepEqual(resolveBinding('linux', 'x64', { isMusl: false }), {
    target: 'linux-x64',
    localFile: 'neko-engine.linux-x64-gnu.node',
    packageName: '@neko-engine/host-napi-linux-x64-gnu',
  });
});

test('unsupported native hosts fail before filesystem or package loading', () => {
  for (const host of [
    { platform: 'darwin', arch: 'x64' },
    { platform: 'linux', arch: 'arm64' },
    { platform: 'linux', arch: 'x64', isMusl: true },
    { platform: 'win32', arch: 'x64' },
    { platform: 'win32', arch: 'arm64' },
    { platform: 'freebsd', arch: 'x64' },
  ]) {
    let loadAttempted = false;
    assert.throws(
      () =>
        loadNativeBinding({
          ...host,
          existsSync() {
            loadAttempted = true;
            throw new Error('unsupported host reached filesystem resolution');
          },
          requireBinding() {
            loadAttempted = true;
            throw new Error('unsupported host reached module resolution');
          },
        }),
      /Unsupported native platform/u,
    );
    assert.equal(
      loadAttempted,
      false,
      `${host.platform}-${host.arch} attempted binding resolution`,
    );
  }
});

test('supported hosts load only their exact local or optional binding identity', () => {
  const loaded = [];
  const localBinding = loadNativeBinding({
    platform: 'darwin',
    arch: 'arm64',
    existsSync: () => true,
    requireBinding(id) {
      loaded.push(id);
      return { id };
    },
  });
  const optionalBinding = loadNativeBinding({
    platform: 'linux',
    arch: 'x64',
    isMusl: false,
    existsSync: () => false,
    requireBinding(id) {
      loaded.push(id);
      return { id };
    },
  });

  assert.deepEqual(localBinding, { id: './neko-engine.darwin-arm64.node' });
  assert.deepEqual(optionalBinding, { id: '@neko-engine/host-napi-linux-x64-gnu' });
  assert.deepEqual(loaded, [
    './neko-engine.darwin-arm64.node',
    '@neko-engine/host-napi-linux-x64-gnu',
  ]);
});

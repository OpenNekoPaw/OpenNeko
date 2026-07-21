'use strict';

const { existsSync } = require('node:fs');
const { join } = require('node:path');

const SUPPORTED_TARGETS = Object.freeze({
  'darwin-arm64': Object.freeze({
    localFile: 'neko-engine.darwin-arm64.node',
    packageName: '@neko-engine/host-napi-darwin-arm64',
  }),
  'linux-x64': Object.freeze({
    localFile: 'neko-engine.linux-x64-gnu.node',
    packageName: '@neko-engine/host-napi-linux-x64-gnu',
  }),
});

const SUPPORTED_TARGET_NAMES = Object.freeze(Object.keys(SUPPORTED_TARGETS));

function detectLinuxMusl(report = process.report) {
  if (!report || typeof report.getReport !== 'function') {
    throw new Error('Cannot determine Linux libc because process.report is unavailable.');
  }

  return !report.getReport().header.glibcVersionRuntime;
}

function resolveBinding(platform, arch, options = {}) {
  const target = `${platform}-${arch}`;
  const binding = SUPPORTED_TARGETS[target];
  const isMusl = platform === 'linux' && arch === 'x64' && (options.isMusl ?? detectLinuxMusl());

  if (!binding || isMusl) {
    const actualTarget = isMusl ? `${target}-musl` : target;
    throw new Error(
      `Unsupported native platform "${actualTarget}". Supported targets: ${SUPPORTED_TARGET_NAMES.join(', ')}.`,
    );
  }

  return {
    ...binding,
    target,
  };
}

function loadNativeBinding(options = {}) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const binding = resolveBinding(platform, arch, { isMusl: options.isMusl });
  const bindingPath = join(__dirname, binding.localFile);
  const fileExists = options.existsSync ?? existsSync;
  const requireBinding = options.requireBinding ?? require;

  try {
    return fileExists(bindingPath)
      ? requireBinding(`./${binding.localFile}`)
      : requireBinding(binding.packageName);
  } catch (cause) {
    throw new Error(`Failed to load native binding for ${binding.target}.`, { cause });
  }
}

module.exports = {
  SUPPORTED_TARGET_NAMES,
  detectLinuxMusl,
  loadNativeBinding,
  resolveBinding,
};

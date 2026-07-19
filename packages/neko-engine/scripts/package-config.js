#!/usr/bin/env node
'use strict';

const path = require('path');
const rawConfig = require('./package-config.json');

const ENGINE_DIR = path.resolve(__dirname, '..');
const NAPI_DIR = path.join(ENGINE_DIR, 'packages', 'host-napi');
const BIN_DIR = path.join(ENGINE_DIR, 'bin');
const DEPS_DIR = path.join(ENGINE_DIR, 'deps');
const BTBN_BASE_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download';

/**
 * @param {string} template
 * @returns {string}
 */
function expandTemplate(template) {
  return template
    .replaceAll('{ffmpegVersion}', rawConfig.ffmpegVersion)
    .replaceAll('{btbnVersion}', rawConfig.btbnVersion)
    .replaceAll('{btbnTag}', rawConfig.btbnTag);
}

/**
 * @returns {string[]}
 */
function getSupportedTargets() {
  return Object.keys(rawConfig.targets);
}

/**
 * @param {string} targetKey
 * @returns {null | {
 *   rustTarget: string;
 *   nodeFile: string;
 *   ffmpeg: { source: 'homebrew'; brewPrefix: string } | { source: 'btbn'; archive: string };
 * }}
 */
function getTargetConfig(targetKey) {
  const target = rawConfig.targets[targetKey];
  if (!target) {
    return null;
  }

  const ffmpeg =
    target.ffmpeg.source === 'homebrew'
      ? {
          source: 'homebrew',
          brewPrefix: target.ffmpeg.brewPrefix,
        }
      : {
          source: 'btbn',
          archive: expandTemplate(target.ffmpeg.archiveTemplate),
        };

  const ffmpegDev = target.ffmpegDev
    ? target.ffmpegDev.source === 'homebrew'
      ? {
          source: 'homebrew',
          brewPrefix: target.ffmpegDev.brewPrefix,
        }
      : {
          source: 'btbn',
          archive: expandTemplate(target.ffmpegDev.archiveTemplate),
        }
    : null;

  return {
    rustTarget: target.rustTarget,
    nodeFile: target.nodeFile,
    ffmpeg,
    ffmpegDev,
  };
}

/**
 * @param {string} rustTarget
 * @returns {string | null}
 */
function getTargetByRustTriple(rustTarget) {
  for (const targetKey of getSupportedTargets()) {
    if (rawConfig.targets[targetKey].rustTarget === rustTarget) {
      return targetKey;
    }
  }

  return null;
}

/**
 * @returns {string}
 */
function getCurrentPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

/**
 * @returns {string[]}
 */
function getFfmpegLibs() {
  return [...rawConfig.ffmpegLibs];
}

/**
 * @param {string} targetKey
 * @returns {string}
 */
function resolveNodeBinaryPath(targetKey) {
  const target = getTargetConfig(targetKey);
  if (!target) {
    throw new Error(`Unsupported target "${targetKey}"`);
  }

  return path.join(NAPI_DIR, target.nodeFile);
}

module.exports = {
  BIN_DIR,
  BTBN_BASE_URL,
  DEPS_DIR,
  ENGINE_DIR,
  NAPI_DIR,
  config: rawConfig,
  getCurrentPlatformKey,
  getFfmpegLibs,
  getSupportedTargets,
  getTargetByRustTriple,
  getTargetConfig,
  resolveNodeBinaryPath,
};

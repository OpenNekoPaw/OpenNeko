#!/usr/bin/env node
'use strict';

const path = require('path');
const rawConfig = require('./package-config.json');

const ENGINE_DIR = path.resolve(__dirname, '..');
const NAPI_DIR = path.join(ENGINE_DIR, 'packages', 'host-napi');
const BIN_DIR = path.join(ENGINE_DIR, 'bin');
const DEPS_DIR = path.join(ENGINE_DIR, 'deps');
const BTBN_BASE_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download';
const BTBN_TAG_PATTERN = /^autobuild-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function projectFfmpegArtifact(artifact, label) {
  if (artifact.source === 'homebrew') {
    if (typeof artifact.brewPrefix !== 'string' || artifact.brewPrefix.length === 0) {
      throw new Error(`Invalid Homebrew FFmpeg prefix for ${label}.`);
    }

    return {
      source: 'homebrew',
      brewPrefix: artifact.brewPrefix,
    };
  }

  if (artifact.source !== 'btbn') {
    throw new Error(
      `Unknown FFmpeg artifact source for ${label}: ${JSON.stringify(artifact.source)}`,
    );
  }
  if (!BTBN_TAG_PATTERN.test(rawConfig.btbnTag)) {
    throw new Error(`Invalid immutable BtbN release tag: ${JSON.stringify(rawConfig.btbnTag)}`);
  }
  if (
    typeof artifact.archive !== 'string' ||
    !/^ffmpeg-.+\.(?:zip|tar\.xz)$/u.test(artifact.archive) ||
    artifact.archive.includes('latest')
  ) {
    throw new Error(
      `Invalid immutable BtbN archive for ${label}: ${JSON.stringify(artifact.archive)}`,
    );
  }
  if (typeof artifact.sha256 !== 'string' || !SHA256_PATTERN.test(artifact.sha256)) {
    throw new Error(`Invalid BtbN SHA256 for ${label}: ${JSON.stringify(artifact.sha256)}`);
  }

  return {
    source: 'btbn',
    archive: artifact.archive,
    sha256: artifact.sha256,
  };
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
 *   ffmpeg: { source: 'homebrew'; brewPrefix: string } | { source: 'btbn'; archive: string; sha256: string };
 * }}
 */
function getTargetConfig(targetKey) {
  const target = rawConfig.targets[targetKey];
  if (!target) {
    return null;
  }

  const ffmpeg = projectFfmpegArtifact(target.ffmpeg, `${targetKey}.ffmpeg`);
  const ffmpegDev = target.ffmpegDev
    ? projectFfmpegArtifact(target.ffmpegDev, `${targetKey}.ffmpegDev`)
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

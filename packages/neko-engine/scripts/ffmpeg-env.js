'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { DEPS_DIR, getCurrentPlatformKey, getTargetConfig } = require('./package-config');

const LINUX_MULTIARCH_TRIPLES = ['x86_64-linux-gnu', 'aarch64-linux-gnu', 'arm-linux-gnueabihf'];

/**
 * @typedef {{
 *   env?: NodeJS.ProcessEnv;
 *   platform?: NodeJS.Platform;
 *   platformKey?: string;
 *   existsSync?: (filePath: string) => boolean;
 *   readdirSync?: typeof fs.readdirSync;
 *   statSync?: typeof fs.statSync;
 *   execFileSync?: typeof execFileSync;
 * }} ResolveOptions
 */

/**
 * @typedef {{
 *   ffmpegDir: string;
 *   pkgConfigPath: string | null;
 *   source: string;
 * }} ResolvedFfmpegEnv
 */

/**
 * @param {string | null | undefined} candidate
 * @param {{ existsSync?: (filePath: string) => boolean }} [deps]
 * @returns {boolean}
 */
function isUsableFfmpegDir(candidate, deps = {}) {
  if (!candidate) {
    return false;
  }

  const existsSync = deps.existsSync ?? fs.existsSync;
  const includeCandidates = [
    path.join(candidate, 'include', 'libavutil', 'avutil.h'),
    path.join(candidate, 'include', 'ffmpeg', 'libavutil', 'avutil.h'),
    ...LINUX_MULTIARCH_TRIPLES.map((triple) =>
      path.join(candidate, 'include', triple, 'libavutil', 'avutil.h'),
    ),
  ];
  const libCandidates = [
    path.join(candidate, 'lib'),
    path.join(candidate, 'lib64'),
    ...LINUX_MULTIARCH_TRIPLES.map((triple) => path.join(candidate, 'lib', triple)),
    path.join(candidate, 'bin'),
  ];

  return (
    includeCandidates.some((filePath) => existsSync(filePath)) &&
    libCandidates.some((filePath) => existsSync(filePath))
  );
}

/**
 * @param {string} ffmpegDir
 * @param {{ existsSync?: (filePath: string) => boolean }} [deps]
 * @returns {string | null}
 */
function getPkgConfigPath(ffmpegDir, deps = {}) {
  const existsSync = deps.existsSync ?? fs.existsSync;
  const candidates = [
    path.join(ffmpegDir, 'lib', 'pkgconfig'),
    path.join(ffmpegDir, 'lib64', 'pkgconfig'),
    ...LINUX_MULTIARCH_TRIPLES.map((triple) => path.join(ffmpegDir, 'lib', triple, 'pkgconfig')),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * @param {{ execFileSync?: typeof execFileSync }} [deps]
 * @returns {string | null}
 */
function queryPkgConfigPrefix(deps = {}) {
  const run = deps.execFileSync ?? execFileSync;

  try {
    const prefix = run('pkg-config', ['--variable=prefix', 'libavcodec'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return prefix || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} baseDir
 * @param {{ readdirSync?: typeof fs.readdirSync; statSync?: typeof fs.statSync }} [deps]
 * @returns {string[]}
 */
function listChildDirectories(baseDir, deps = {}) {
  const readdirSync = deps.readdirSync ?? fs.readdirSync;
  const statSync = deps.statSync ?? fs.statSync;

  try {
    return readdirSync(baseDir)
      .map((entry) => path.join(baseDir, entry))
      .filter((entryPath) => {
        try {
          return statSync(entryPath).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * @param {ResolveOptions} [options]
 * @returns {Array<{ path: string; source: string }>}
 */
function getSearchCandidates(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const platformKey = options.platformKey ?? getCurrentPlatformKey();
  const candidates = [];
  const seen = new Set();

  /**
   * @param {string | null | undefined} candidatePath
   * @param {string} source
   */
  function pushCandidate(candidatePath, source) {
    if (!candidatePath) {
      return;
    }

    const normalizedPath = path.resolve(candidatePath);
    if (seen.has(normalizedPath)) {
      return;
    }

    seen.add(normalizedPath);
    candidates.push({
      path: normalizedPath,
      source,
    });
  }

  pushCandidate(env.FFMPEG_DIR, 'environment');
  pushCandidate(queryPkgConfigPrefix(options), 'pkg-config');

  const target = getTargetConfig(platformKey);
  if (target?.ffmpegDev?.source === 'homebrew') {
    pushCandidate(target.ffmpegDev.brewPrefix, 'homebrew-dev');
  }
  if (target?.ffmpeg?.source === 'homebrew') {
    pushCandidate(target.ffmpeg.brewPrefix, 'homebrew-runtime');
  }

  if (platform === 'darwin') {
    pushCandidate('/opt/homebrew/opt/ffmpeg', 'homebrew-default');
    pushCandidate('/usr/local/opt/ffmpeg', 'homebrew-default');
  }

  if (platform === 'linux') {
    pushCandidate('/usr', 'system');
    pushCandidate('/usr/local', 'system');
  }

  if (platform === 'win32') {
    const chocolateyInstall =
      env.ChocolateyInstall ?? path.join(env.ProgramData ?? 'C:\\ProgramData', 'chocolatey');
    const chocolateyToolsDir = path.join(chocolateyInstall, 'lib', 'ffmpeg-shared', 'tools');
    pushCandidate(path.join(chocolateyToolsDir, 'ffmpeg'), 'chocolatey');
    for (const entryPath of listChildDirectories(chocolateyToolsDir, options)) {
      pushCandidate(entryPath, 'chocolatey');
    }

    pushCandidate('C:\\ffmpeg', 'system');
    pushCandidate('C:\\Program Files\\ffmpeg', 'system');
    if (env.USERPROFILE) {
      pushCandidate(path.join(env.USERPROFILE, 'ffmpeg'), 'system');
    }
  }

  pushCandidate(path.join(DEPS_DIR, 'ffmpeg'), 'workspace');

  return candidates;
}

/**
 * @param {ResolveOptions} [options]
 * @returns {ResolvedFfmpegEnv | null}
 */
function resolveFfmpegEnv(options = {}) {
  const existsSync = options.existsSync ?? fs.existsSync;

  for (const candidate of getSearchCandidates(options)) {
    if (!isUsableFfmpegDir(candidate.path, { existsSync })) {
      continue;
    }

    return {
      ffmpegDir: candidate.path,
      pkgConfigPath: getPkgConfigPath(candidate.path, { existsSync }),
      source: candidate.source,
    };
  }

  return null;
}

/**
 * ffmpeg-sys-next treats FFMPEG_DIR as a prebuilt prefix and only searches
 * <prefix>/include. Linux distro packages often use multiarch include paths
 * such as /usr/include/x86_64-linux-gnu, so those must fall through to
 * pkg-config instead.
 *
 * @param {ResolvedFfmpegEnv} resolved
 * @returns {boolean}
 */
function shouldSetFfmpegDir(resolved) {
  return resolved.source !== 'pkg-config' && resolved.source !== 'system';
}

/**
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {ResolvedFfmpegEnv} resolved
 * @returns {NodeJS.ProcessEnv}
 */
function createBuildEnv(baseEnv, resolved) {
  const env = { ...baseEnv };
  if (shouldSetFfmpegDir(resolved)) {
    env.FFMPEG_DIR = resolved.ffmpegDir;
  } else {
    delete env.FFMPEG_DIR;
  }

  if (resolved.pkgConfigPath) {
    env.PKG_CONFIG_PATH = env.PKG_CONFIG_PATH
      ? `${resolved.pkgConfigPath}${path.delimiter}${env.PKG_CONFIG_PATH}`
      : resolved.pkgConfigPath;
  }

  return env;
}

/**
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
function formatMissingFfmpegMessage(platform = process.platform) {
  const lines = [
    'Unable to locate FFmpeg development files for neko-engine.',
    'Expected a directory containing include/libavutil/avutil.h and FFmpeg shared libraries.',
    '',
    'You can fix this in one of these ways:',
    '  1. Run `pnpm --dir packages/neko-engine run setup:ffmpeg` to populate `packages/neko-engine/deps/ffmpeg`.',
  ];

  if (platform === 'darwin') {
    lines.push('  2. Install Homebrew FFmpeg: `brew install ffmpeg pkg-config`.');
  } else if (platform === 'linux') {
    lines.push(
      '  2. Install system dev packages, e.g. `sudo apt-get install -y libavcodec-dev libavformat-dev libavutil-dev libswscale-dev libswresample-dev pkg-config`.',
    );
  } else if (platform === 'win32') {
    lines.push('  2. Install FFmpeg and set `FFMPEG_DIR` to its install prefix.');
  } else {
    lines.push('  2. Set `FFMPEG_DIR` to your FFmpeg install prefix.');
  }

  return lines.join('\n');
}

module.exports = {
  createBuildEnv,
  formatMissingFfmpegMessage,
  getSearchCandidates,
  resolveFfmpegEnv,
};

#!/usr/bin/env node
/**
 * Download FFmpeg shared libraries + headers for local Rust compilation.
 *
 * Outputs to packages/neko-engine/deps/ffmpeg/ so that FFMPEG_DIR can
 * point there during `cargo build`, avoiding the slow from-source
 * compilation of FFmpeg.
 *
 * Sources:
 *   macOS  — Copies from Homebrew installation (lib + include)
 *   Linux  — Downloads BtbN pre-built shared builds
 *   Windows — Downloads BtbN pre-built shared builds
 *
 * Usage:
 *   node scripts/download-ffmpeg.js                         # current platform
 *   node scripts/download-ffmpeg.js --platform linux-x64    # specific platform
 *   node scripts/download-ffmpeg.js --force                 # re-download even if present
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  BTBN_BASE_URL,
  DEPS_DIR,
  config,
  getCurrentPlatformKey,
  getFfmpegLibs,
  getSupportedTargets,
  getTargetConfig,
} = require('./package-config');

const FFMPEG_DIR = path.join(DEPS_DIR, 'ffmpeg');
const FFMPEG_LIBS = getFfmpegLibs();

/**
 * Check if FFmpeg dev files are already present.
 * @returns {boolean}
 */
function isAlreadyPresent() {
  const libDir = path.join(FFMPEG_DIR, 'lib');
  const includeDir = path.join(FFMPEG_DIR, 'include', 'libavutil');

  if (!fs.existsSync(libDir) || !fs.existsSync(includeDir)) {
    return false;
  }

  const libEntries = fs.readdirSync(libDir);
  return libEntries.some(
    (entry) => entry.includes('avutil') && (entry.endsWith('.dylib') || entry.includes('.so') || entry.endsWith('.lib')),
  );
}

/**
 * Copy FFmpeg headers and dylibs from a Homebrew installation.
 * @param {string} brewPrefix - Homebrew FFmpeg prefix path
 */
function setupFromHomebrew(brewPrefix) {
  const srcLib = path.join(brewPrefix, 'lib');
  const srcInclude = path.join(brewPrefix, 'include');

  if (!fs.existsSync(srcLib)) {
    console.error(`ERROR: Homebrew FFmpeg not found at ${brewPrefix}`);
    console.error('  Install: brew install ffmpeg');
    process.exit(1);
  }

  const destLib = path.join(FFMPEG_DIR, 'lib');
  const destInclude = path.join(FFMPEG_DIR, 'include');
  fs.mkdirSync(destLib, { recursive: true });
  fs.mkdirSync(destInclude, { recursive: true });

  // Copy include directories (libavcodec/, libavformat/, etc.)
  console.log(`  [source] ${srcInclude}`);
  for (const dir of fs.readdirSync(srcInclude)) {
    const srcDir = path.join(srcInclude, dir);
    if (!fs.statSync(srcDir).isDirectory()) {
      continue;
    }

    const destDir = path.join(destInclude, dir);
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    console.log(`  [copy]   include/${dir}/`);
  }

  // Copy dylibs
  console.log(`  [source] ${srcLib}`);
  for (const lib of FFMPEG_LIBS) {
    const files = fs
      .readdirSync(srcLib)
      .filter((entry) => entry.startsWith(`lib${lib}.`) && entry.endsWith('.dylib'));

    for (const file of files) {
      const src = path.join(srcLib, file);
      const dest = path.join(destLib, file);
      // Resolve symlinks to copy the actual file
      const realSrc = fs.realpathSync(src);
      fs.copyFileSync(realSrc, dest);
      console.log(`  [copy]   lib/${file}`);
    }
  }

  // Also copy pkgconfig files if available
  const srcPkgconfig = path.join(srcLib, 'pkgconfig');
  if (fs.existsSync(srcPkgconfig)) {
    const destPkgconfig = path.join(destLib, 'pkgconfig');
    fs.mkdirSync(destPkgconfig, { recursive: true });
    for (const file of fs.readdirSync(srcPkgconfig)) {
      if (FFMPEG_LIBS.some((lib) => file.startsWith(`lib${lib}`))) {
        fs.copyFileSync(path.join(srcPkgconfig, file), path.join(destPkgconfig, file));
      }
    }
  }
}

/**
 * Download and extract FFmpeg shared build from BtbN.
 * @param {string} archive - Archive filename
 */
function setupFromBtbn(archive) {
  const url = `${BTBN_BASE_URL}/${config.btbnTag}/${archive}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-dev-'));

  try {
    const archivePath = path.join(tmpDir, archive);

    console.log(`  [download] ${archive}`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', archivePath, url], { stdio: 'inherit' });

    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir);

    if (archive.endsWith('.tar.xz')) {
      execFileSync('tar', ['xJf', archivePath, '-C', extractDir, '--strip-components=1'], { stdio: 'inherit' });
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', extractDir], { stdio: 'inherit' });
      // Handle nested directory in zip
      const entries = fs.readdirSync(extractDir);
      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        const inner = path.join(extractDir, entries[0]);
        for (const entry of fs.readdirSync(inner)) {
          fs.renameSync(path.join(inner, entry), path.join(extractDir, entry));
        }
        fs.rmdirSync(inner);
      }
    }

    // Copy include/
    const srcInclude = path.join(extractDir, 'include');
    const destInclude = path.join(FFMPEG_DIR, 'include');
    if (fs.existsSync(srcInclude)) {
      fs.mkdirSync(destInclude, { recursive: true });
      copyDirRecursive(srcInclude, destInclude);
      console.log('  [copy]   include/');
    }

    // Copy lib/
    const srcLib = path.join(extractDir, 'lib');
    const destLib = path.join(FFMPEG_DIR, 'lib');
    if (fs.existsSync(srcLib)) {
      fs.mkdirSync(destLib, { recursive: true });
      copyDirRecursive(srcLib, destLib);
      console.log('  [copy]   lib/');
    }

    // For Windows: also copy bin/*.dll to lib/ for FFMPEG_DIR discovery
    const srcBin = path.join(extractDir, 'bin');
    if (archive.endsWith('.zip') && fs.existsSync(srcBin)) {
      fs.mkdirSync(destLib, { recursive: true });
      for (const file of fs.readdirSync(srcBin)) {
        if (file.endsWith('.dll') || file.endsWith('.lib')) {
          fs.copyFileSync(path.join(srcBin, file), path.join(destLib, file));
          console.log(`  [copy]   lib/${file}`);
        }
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyDirRecursive(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * @param {string} platformKey
 * @param {{ force: boolean }} options
 */
function setupPlatform(platformKey, options) {
  const cfg = getTargetConfig(platformKey);
  if (!cfg || !cfg.ffmpegDev) {
    throw new Error(
      `No ffmpegDev config for platform "${platformKey}". Valid: ${getSupportedTargets().join(', ')}`,
    );
  }

  if (!options.force && isAlreadyPresent()) {
    console.log(`  [skip] FFmpeg dev files already present in ${FFMPEG_DIR}`);
    return;
  }

  // Clean existing
  if (fs.existsSync(FFMPEG_DIR)) {
    fs.rmSync(FFMPEG_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FFMPEG_DIR, { recursive: true });

  if (cfg.ffmpegDev.source === 'homebrew') {
    setupFromHomebrew(cfg.ffmpegDev.brewPrefix);
  } else {
    setupFromBtbn(cfg.ffmpegDev.archive);
  }
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const platformIdx = argv.indexOf('--platform');
  return {
    explicitPlatform: platformIdx === -1 ? null : argv[platformIdx + 1] ?? null,
    force: argv.includes('--force'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const platformKey = args.explicitPlatform ?? getCurrentPlatformKey();

  if (!getTargetConfig(platformKey)) {
    console.warn(`Warning: no config for platform "${platformKey}". Skipping.`);
    return;
  }

  console.log(`Setting up FFmpeg ${config.ffmpegVersion} dev libraries for: ${platformKey}`);
  setupPlatform(platformKey, { force: args.force });
  console.log(`\nFFmpeg dev files written to: ${FFMPEG_DIR}`);
  console.log(`Set FFMPEG_DIR=${FFMPEG_DIR} when running cargo build.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

module.exports = {
  FFMPEG_DIR,
  isAlreadyPresent,
  main,
  parseArgs,
  setupFromBtbn,
  setupFromHomebrew,
  setupPlatform,
};

#!/usr/bin/env node
/**
 * Bundle FFmpeg shared libraries for platform-specific VSIX packaging.
 *
 * Copies FFmpeg dylibs into packages/host-napi/ (same dir as .node file)
 * so the dynamic linker finds them via @loader_path (macOS) / $ORIGIN (Linux).
 *
 * Sources:
 *   macOS  — Homebrew installation
 *   Linux  — BtbN pre-built shared builds (same source as Dockerfile)
 *   Windows — BtbN pre-built Windows builds
 *
 * Usage:
 *   node scripts/bundle-ffmpeg.js                         # current platform
 *   node scripts/bundle-ffmpeg.js --platform darwin-arm64 # specific platform
 *   node scripts/bundle-ffmpeg.js --clean                 # remove bundled libs
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { assertFileSha256 } = require('./ffmpeg-artifact');

const {
  BTBN_BASE_URL,
  NAPI_DIR,
  config,
  getCurrentPlatformKey,
  getFfmpegLibs,
  getSupportedTargets,
  getTargetConfig,
} = require('./package-config');

const FFMPEG_LIBS = getFfmpegLibs();

function log(msg) {
  console.log(`  ${msg}`);
}

/** Remove all bundled FFmpeg libs from NAPI_DIR */
function cleanBundledLibs() {
  const dllPatterns = FFMPEG_LIBS.map((lib) => new RegExp(`${lib}.*\\.dll$`));
  const patterns = [/\.dylib$/, /\.so/, ...dllPatterns];

  for (const entry of fs.readdirSync(NAPI_DIR)) {
    if (patterns.some((pattern) => pattern.test(entry))) {
      fs.unlinkSync(path.join(NAPI_DIR, entry));
      log(`[clean] ${entry}`);
    }
  }
}

function bundleMacOS(cfg) {
  const libDir = path.join(cfg.ffmpeg.brewPrefix, 'lib');

  if (!fs.existsSync(libDir)) {
    console.error(`ERROR: Homebrew FFmpeg not found at ${cfg.ffmpeg.brewPrefix}`);
    console.error('  Install: brew install ffmpeg');
    process.exit(1);
  }

  log(`[source] ${libDir}`);

  const copied = [];
  for (const lib of FFMPEG_LIBS) {
    const files = fs
      .readdirSync(libDir)
      .filter(
        (entry) =>
          entry.startsWith(`lib${lib}.`) &&
          entry.endsWith('.dylib') &&
          !entry.endsWith('.dylib.dSYM'),
      );

    const sorted = files.sort((left, right) => left.length - right.length);
    const mainLib = sorted.find((entry) => /^lib\w+\.\d+\.dylib$/.test(entry)) || sorted[0];

    if (!mainLib) {
      console.error(`ERROR: lib${lib} not found in ${libDir}`);
      process.exit(1);
    }

    const src = path.join(libDir, mainLib);
    const dest = path.join(NAPI_DIR, mainLib);
    fs.copyFileSync(src, dest);
    copied.push(mainLib);
    log(`[copy]   ${mainLib}`);
  }

  const nodeFile = path.join(NAPI_DIR, cfg.nodeFile);
  if (fs.existsSync(nodeFile)) {
    log(`[patch]  ${cfg.nodeFile} — rewriting dylib paths to @loader_path/`);
    for (const lib of copied) {
      const oldPath = path.join(libDir, lib);
      const newPath = `@loader_path/${lib}`;
      try {
        execFileSync('install_name_tool', ['-change', oldPath, newPath, nodeFile], {
          stdio: 'pipe',
        });
      } catch {
        try {
          execFileSync('install_name_tool', ['-change', `@rpath/${lib}`, newPath, nodeFile], {
            stdio: 'pipe',
          });
        } catch {
          // Ignore — path may already be correct
        }
      }
    }
  }

  for (const lib of copied) {
    const libPath = path.join(NAPI_DIR, lib);
    execFileSync('install_name_tool', ['-id', `@loader_path/${lib}`, libPath], { stdio: 'pipe' });

    for (const otherLib of copied) {
      if (otherLib === lib) {
        continue;
      }

      const oldRef = path.join(libDir, otherLib);
      const newRef = `@loader_path/${otherLib}`;
      try {
        execFileSync('install_name_tool', ['-change', oldRef, newRef, libPath], { stdio: 'pipe' });
      } catch {
        // Ignore
      }
    }
  }

  log('[sign]   ad-hoc codesigning modified files');
  if (fs.existsSync(nodeFile)) {
    execFileSync('codesign', ['--force', '--sign', '-', nodeFile], { stdio: 'pipe' });
  }
  for (const lib of copied) {
    execFileSync('codesign', ['--force', '--sign', '-', path.join(NAPI_DIR, lib)], {
      stdio: 'pipe',
    });
  }

  return copied;
}

function bundleBtbN(cfg, platform) {
  const { archive, sha256 } = cfg.ffmpeg;
  const url = `${BTBN_BASE_URL}/${config.btbnTag}/${archive}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-'));
  const archivePath = path.join(tmpDir, archive);

  try {
    log(`[download] ${archive}`);
    execFileSync('curl', ['-fsSL', '--retry', '3', '-o', archivePath, url], { stdio: 'inherit' });
    assertFileSha256(archivePath, sha256);
    log(`[verify] ${sha256}`);

    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir);

    if (archive.endsWith('.tar.xz')) {
      execFileSync('tar', ['xJf', archivePath, '-C', extractDir, '--strip-components=1'], {
        stdio: 'inherit',
      });
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', extractDir], { stdio: 'inherit' });
      const entries = fs.readdirSync(extractDir);
      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        const inner = path.join(extractDir, entries[0]);
        for (const entry of fs.readdirSync(inner)) {
          fs.renameSync(path.join(inner, entry), path.join(extractDir, entry));
        }
        fs.rmdirSync(inner);
      }
    }

    let libDir;
    if (fs.existsSync(path.join(extractDir, 'lib'))) {
      libDir = path.join(extractDir, 'lib');
    } else if (fs.existsSync(path.join(extractDir, 'bin'))) {
      libDir = path.join(extractDir, 'bin');
    } else {
      console.error('ERROR: Cannot find lib/ or bin/ in extracted FFmpeg archive');
      process.exit(1);
    }

    const copied = [];
    const isWindows = platform === 'win32-x64';

    for (const lib of FFMPEG_LIBS) {
      if (isWindows) {
        const dll = fs
          .readdirSync(libDir)
          .find((entry) => entry.startsWith(`${lib}-`) && entry.endsWith('.dll'));
        if (dll) {
          fs.copyFileSync(path.join(libDir, dll), path.join(NAPI_DIR, dll));
          copied.push(dll);
          log(`[copy]   ${dll}`);
        }
      } else {
        const soFiles = fs.readdirSync(libDir).filter((entry) => entry.startsWith(`lib${lib}.so`));
        for (const soFile of soFiles) {
          const src = path.join(libDir, soFile);
          const dest = path.join(NAPI_DIR, soFile);
          const realSrc = fs.realpathSync(src);
          fs.copyFileSync(realSrc, dest);
          copied.push(soFile);
          log(`[copy]   ${soFile}`);
        }
      }
    }

    if (!isWindows) {
      const nodeFile = path.join(NAPI_DIR, cfg.nodeFile);
      if (fs.existsSync(nodeFile)) {
        log(`[patch]  ${cfg.nodeFile} — setting RPATH to $ORIGIN`);
        try {
          execFileSync('patchelf', ['--set-rpath', '$ORIGIN', nodeFile], { stdio: 'pipe' });
        } catch {
          log('[warn]   patchelf not found — install with: sudo apt-get install patchelf');
          log('[warn]   The .node file may fail to load FFmpeg libs at runtime');
        }
      }
    }

    return copied;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--clean')) {
    console.log('Cleaning bundled FFmpeg libs...');
    cleanBundledLibs();
    return;
  }

  const platformIdx = args.indexOf('--platform');
  const platformKey =
    platformIdx !== -1 ? (args[platformIdx + 1] ?? null) : getCurrentPlatformKey();
  const cfg = platformKey ? getTargetConfig(platformKey) : null;
  if (!cfg) {
    console.error(`Unknown platform: "${platformKey}"`);
    console.error(`Valid platforms: ${getSupportedTargets().join(', ')}`);
    process.exit(1);
  }

  console.log(`Bundling FFmpeg libs for: ${platformKey}`);
  cleanBundledLibs();

  const copied = cfg.ffmpeg.source === 'homebrew' ? bundleMacOS(cfg) : bundleBtbN(cfg, platformKey);
  console.log(`\nBundled ${copied.length} FFmpeg libraries to: ${NAPI_DIR}`);
}

main();

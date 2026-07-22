#!/usr/bin/env node
/**
 * Bundle FFmpeg shared libraries for platform-specific VSIX packaging.
 *
 * Copies FFmpeg dylibs into packages/host-napi/ (same dir as .node file)
 * so the dynamic linker finds them via @loader_path (macOS) / $ORIGIN (Linux).
 *
 * Sources:
 *   macOS  — Homebrew installation
 *   Linux — BtbN pre-built shared builds (same source as Dockerfile)
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
const MACOS_SYSTEM_LIBRARY_PREFIXES = Object.freeze([
  '/System/Library/',
  '/usr/lib/',
  '/Library/Apple/System/Library/',
]);

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

function readMachOInstallName(filePath) {
  try {
    return execFileSync('otool', ['-D', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split(/\r?\n/u)
      .slice(1)
      .map((entry) => entry.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

function readMachODependencies(filePath) {
  const installName = readMachOInstallName(filePath);
  return execFileSync('otool', ['-L', filePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split(/\r?\n/u)
    .slice(1)
    .map((entry) => entry.trim().split(/ \(compatibility version /u)[0])
    .filter((entry) => entry && entry !== installName);
}

function readMachORpaths(filePath) {
  const lines = execFileSync('otool', ['-l', filePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).split(/\r?\n/u);
  const rpaths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== 'cmd LC_RPATH') continue;
    for (let detailIndex = index + 1; detailIndex < lines.length; detailIndex += 1) {
      const detail = lines[detailIndex]?.trim() ?? '';
      if (detail.startsWith('cmd ')) break;
      const match = /^path (.+) \(offset \d+\)$/u.exec(detail);
      if (match) {
        rpaths.push(match[1]);
        break;
      }
    }
  }
  return rpaths;
}

function isMacOSSystemLibrary(dependency) {
  return MACOS_SYSTEM_LIBRARY_PREFIXES.some((prefix) => dependency.startsWith(prefix));
}

function resolveMacOSDynamicDependency(dependency, consumerSource, exists) {
  const consumerDirectory = path.dirname(consumerSource);
  if (dependency.startsWith('@loader_path/')) {
    const candidate = path.join(consumerDirectory, dependency.slice('@loader_path/'.length));
    return exists(candidate) ? candidate : undefined;
  }
  if (dependency.startsWith('@rpath/')) {
    const suffix = dependency.slice('@rpath/'.length);
    for (const rpath of readMachORpaths(consumerSource)) {
      const expandedRpath = rpath.startsWith('@loader_path')
        ? path.join(consumerDirectory, rpath.slice('@loader_path'.length))
        : rpath;
      if (!path.isAbsolute(expandedRpath)) continue;
      const candidate = path.join(expandedRpath, suffix);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

function materializeMacOSRuntimeClosure({
  destinationDir,
  rootConsumers,
  seedLibraries,
  readDependencies = readMachODependencies,
  exists = fs.existsSync,
  realpath = fs.realpathSync,
  copyFile = fs.copyFileSync,
  rewriteDependency = (consumer, dependency, replacement) =>
    execFileSync('install_name_tool', ['-change', dependency, replacement, consumer], {
      stdio: 'pipe',
    }),
  setInstallName = (filePath, installName) =>
    execFileSync('install_name_tool', ['-id', installName, filePath], { stdio: 'pipe' }),
  signFile = (filePath) =>
    execFileSync('codesign', ['--force', '--sign', '-', filePath], { stdio: 'pipe' }),
  resolveDynamicDependency = resolveMacOSDynamicDependency,
  onCopy = () => {},
}) {
  const stagedSources = new Map();
  const consumerSources = new Map(rootConsumers.map((consumer) => [consumer, consumer]));
  const pendingConsumers = [...rootConsumers];

  function stageLibrary(sourcePath, runtimeName = path.basename(sourcePath)) {
    if (!exists(sourcePath)) {
      throw new Error(`macOS runtime dependency does not exist: ${sourcePath}`);
    }
    const canonicalSource = realpath(sourcePath);
    const existingSource = stagedSources.get(runtimeName);
    if (existingSource && existingSource !== canonicalSource) {
      throw new Error(
        `macOS runtime basename collision for ${runtimeName}: ${existingSource} and ${canonicalSource}.`,
      );
    }
    const destinationPath = path.join(destinationDir, runtimeName);
    if (!existingSource) {
      copyFile(canonicalSource, destinationPath);
      stagedSources.set(runtimeName, canonicalSource);
      consumerSources.set(destinationPath, canonicalSource);
      pendingConsumers.push(destinationPath);
      onCopy(runtimeName);
    }
    return destinationPath;
  }

  for (const seedLibrary of seedLibraries) stageLibrary(seedLibrary);

  for (let index = 0; index < pendingConsumers.length; index += 1) {
    const consumer = pendingConsumers[index];
    const consumerSource = consumerSources.get(consumer);
    if (!consumerSource) {
      throw new Error(`macOS runtime consumer has no source identity: ${consumer}`);
    }
    for (const dependency of readDependencies(consumer)) {
      if (isMacOSSystemLibrary(dependency)) continue;

      const runtimeName = path.basename(dependency);
      let sourcePath;
      if (path.isAbsolute(dependency)) {
        sourcePath = dependency;
      } else if (dependency.startsWith('@loader_path/') || dependency.startsWith('@rpath/')) {
        sourcePath = stagedSources.get(runtimeName);
        sourcePath ??= resolveDynamicDependency(dependency, consumerSource, exists);
      } else {
        throw new Error(`Unsupported macOS runtime load path in ${consumer}: ${dependency}.`);
      }

      if (!sourcePath) {
        throw new Error(
          `macOS runtime dependency cannot be resolved for ${consumer}: ${dependency}.`,
        );
      }
      stageLibrary(sourcePath, runtimeName);
      const replacement = `@loader_path/${runtimeName}`;
      if (dependency !== replacement) {
        rewriteDependency(consumer, dependency, replacement);
      }
    }
  }

  for (const rootConsumer of rootConsumers) {
    setInstallName(rootConsumer, `@loader_path/${path.basename(rootConsumer)}`);
  }
  for (const runtimeName of stagedSources.keys()) {
    const runtimePath = path.join(destinationDir, runtimeName);
    setInstallName(runtimePath, `@loader_path/${runtimeName}`);
  }
  for (const runtimeName of stagedSources.keys()) {
    signFile(path.join(destinationDir, runtimeName));
  }
  for (const rootConsumer of rootConsumers) signFile(rootConsumer);

  return [...stagedSources.keys()];
}

function assertMacOSRuntimeClosure(
  files,
  {
    readDependencies = readMachODependencies,
    readInstallName = readMachOInstallName,
    exists = fs.existsSync,
  } = {},
) {
  for (const filePath of files) {
    const expectedInstallName = `@loader_path/${path.basename(filePath)}`;
    const installName = readInstallName(filePath);
    if (installName && installName !== expectedInstallName) {
      throw new Error(
        `macOS runtime install name is not feature-relative: ${filePath} -> ${installName}.`,
      );
    }
    for (const dependency of readDependencies(filePath)) {
      if (isMacOSSystemLibrary(dependency)) continue;
      if (!dependency.startsWith('@loader_path/')) {
        throw new Error(
          `macOS runtime dependency is not feature-relative: ${filePath} -> ${dependency}.`,
        );
      }
      const dependencyPath = path.join(
        path.dirname(filePath),
        dependency.slice('@loader_path/'.length),
      );
      if (!exists(dependencyPath)) {
        throw new Error(
          `macOS runtime dependency is missing from the payload: ${filePath} -> ${dependency}.`,
        );
      }
    }
  }
  return Object.freeze({ fileCount: files.length });
}

function bundleMacOS(cfg) {
  const libDir = path.join(cfg.ffmpeg.brewPrefix, 'lib');
  if (!fs.existsSync(libDir)) {
    throw new Error(`Homebrew FFmpeg not found at ${cfg.ffmpeg.brewPrefix}.`);
  }
  log(`[source] ${libDir}`);

  const seedLibraries = FFMPEG_LIBS.map((lib) => {
    const files = fs
      .readdirSync(libDir)
      .filter(
        (entry) =>
          entry.startsWith(`lib${lib}.`) &&
          entry.endsWith('.dylib') &&
          !entry.endsWith('.dylib.dSYM'),
      )
      .sort((left, right) => left.length - right.length);
    const mainLib = files.find((entry) => /^lib\w+\.\d+\.dylib$/u.test(entry)) ?? files[0];
    if (!mainLib) throw new Error(`lib${lib} not found in ${libDir}.`);
    return path.join(libDir, mainLib);
  });

  const nodeFile = path.join(NAPI_DIR, cfg.nodeFile);
  if (!fs.existsSync(nodeFile)) {
    throw new Error(`Engine native binary does not exist: ${nodeFile}.`);
  }
  log(`[patch]  ${cfg.nodeFile} — materializing recursive @loader_path closure`);
  const copied = materializeMacOSRuntimeClosure({
    destinationDir: NAPI_DIR,
    rootConsumers: [nodeFile],
    seedLibraries,
    onCopy: (runtimeName) => log(`[copy]   ${runtimeName}`),
  });
  assertMacOSRuntimeClosure([
    nodeFile,
    ...copied.map((runtimeName) => path.join(NAPI_DIR, runtimeName)),
  ]);
  log('[sign]   ad-hoc codesigned native closure');
  return copied;
}

function readElfSoname(filePath) {
  return execFileSync('patchelf', ['--print-soname', filePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readElfNeeded(filePath) {
  return execFileSync('patchelf', ['--print-needed', filePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function materializeLinuxFfmpegClosure(
  libDir,
  destinationDir,
  ffmpegLibs = FFMPEG_LIBS,
  { readNeeded = readElfNeeded, readSoname = readElfSoname, rootConsumers = [] } = {},
) {
  const sourceEntries = fs.readdirSync(libDir).sort();
  const copied = [];

  for (const lib of ffmpegLibs) {
    const majorVersionPattern = new RegExp(`^lib${lib}\\.so\\.\\d+$`, 'u');
    const candidates = sourceEntries.filter((entry) => majorVersionPattern.test(entry));
    if (candidates.length !== 1) {
      throw new Error(
        `FFmpeg library ${lib} must have exactly one major-version alias; received ${candidates.join(', ') || '<none>'}.`,
      );
    }

    const runtimeName = candidates[0];
    const realSource = fs.realpathSync(path.join(libDir, runtimeName));
    const soname = readSoname(realSource);
    if (soname !== runtimeName) {
      throw new Error(
        `FFmpeg runtime alias ${runtimeName} disagrees with ELF SONAME ${soname || '<none>'}.`,
      );
    }

    fs.copyFileSync(realSource, path.join(destinationDir, runtimeName));
    copied.push(runtimeName);
    log(`[copy]   ${runtimeName}`);
  }

  const runtimeNames = new Set(copied);
  const archiveRuntimeNames = new Set(
    sourceEntries.filter((entry) => /^lib[^/]+\.so\.\d+$/u.test(entry)),
  );
  const ffmpegDependencyPatterns = ffmpegLibs.map(
    (lib) => new RegExp(`^lib${lib}\\.so(?:\\.\\d+)?$`, 'u'),
  );
  const consumers = [
    ...rootConsumers,
    ...copied.map((runtimeName) => path.join(destinationDir, runtimeName)),
  ];
  for (const consumer of consumers) {
    for (const dependency of readNeeded(consumer)) {
      if (
        (archiveRuntimeNames.has(dependency) ||
          ffmpegDependencyPatterns.some((pattern) => pattern.test(dependency))) &&
        !runtimeNames.has(dependency)
      ) {
        throw new Error(
          `${path.basename(consumer)} requires missing FFmpeg runtime ${dependency}.`,
        );
      }
    }
  }

  return copied;
}

function bundleBtbN(cfg) {
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

    execFileSync('tar', ['xJf', archivePath, '-C', extractDir, '--strip-components=1'], {
      stdio: 'inherit',
    });

    let libDir;
    if (fs.existsSync(path.join(extractDir, 'lib'))) {
      libDir = path.join(extractDir, 'lib');
    } else {
      console.error('ERROR: Cannot find lib/ in extracted FFmpeg archive');
      process.exit(1);
    }

    const nodeFile = path.join(NAPI_DIR, cfg.nodeFile);
    const copied = materializeLinuxFfmpegClosure(libDir, NAPI_DIR, FFMPEG_LIBS, {
      rootConsumers: fs.existsSync(nodeFile) ? [nodeFile] : [],
    });

    if (fs.existsSync(nodeFile)) {
      log(`[patch]  ${cfg.nodeFile} — setting RPATH to $ORIGIN`);
      execFileSync('patchelf', ['--set-rpath', '$ORIGIN', nodeFile], { stdio: 'pipe' });
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

  const copied = cfg.ffmpeg.source === 'homebrew' ? bundleMacOS(cfg) : bundleBtbN(cfg);
  console.log(`\nBundled ${copied.length} FFmpeg libraries to: ${NAPI_DIR}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  assertMacOSRuntimeClosure,
  materializeLinuxFfmpegClosure,
  materializeMacOSRuntimeClosure,
};

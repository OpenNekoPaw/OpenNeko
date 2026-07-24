#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  ENGINE_DIR,
  NAPI_DIR,
  getCurrentPlatformKey,
  getSupportedTargets,
  getTargetConfig,
  resolveNodeBinaryPath,
} = require('./package-config');

/**
 * @typedef {{ basename: string; fullPath: string; mtimeMs: number }} VsixFile
 */

/**
 * @param {string[]} argv
 * @returns {{ help: boolean; skipNativeBuild: boolean; target: string | null }}
 */
function parseArgs(argv) {
  const args = [...argv];
  const explicitTargetIndex = args.indexOf('--target');
  const explicitTarget =
    explicitTargetIndex === -1 ? null : (args[explicitTargetIndex + 1] ?? null);
  const positionalTarget = args.find((arg) => arg !== '--' && !arg.startsWith('--'));

  return {
    help: args.includes('--help') || args.includes('-h'),
    skipNativeBuild: args.includes('--skip-native-build'),
    target: explicitTarget ?? positionalTarget ?? null,
  };
}

/**
 * @param {string | null} target
 */
function assertTarget(target) {
  if (!target) {
    throw new Error(
      `Usage: node scripts/package-platform.js --target <${getSupportedTargets().join('|')}>`,
    );
  }

  if (!getTargetConfig(target)) {
    throw new Error(
      `Unknown target "${target}". Valid targets: ${getSupportedTargets().join(', ')}`,
    );
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function runCommand(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/**
 * @param {Partial<ReturnType<typeof createContext>>} [overrides]
 */
function createContext(overrides = {}) {
  return {
    currentPlatformKey: getCurrentPlatformKey(),
    existsSync: fs.existsSync,
    log: console.log,
    readdirSync: fs.readdirSync,
    runNodeScript(scriptName, args) {
      runCommand(process.execPath, [path.join(__dirname, scriptName), ...args], ENGINE_DIR);
    },
    runNpx(cwd, args) {
      runCommand('npx', args, cwd);
    },
    runPnpm(cwd, args) {
      runCommand('pnpm', args, cwd);
    },
    statSync: fs.statSync,
    unlinkSync: fs.unlinkSync,
    ...overrides,
  };
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 * @returns {VsixFile[]}
 */
function listVsixFiles(ctx) {
  return ctx
    .readdirSync(ENGINE_DIR)
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => {
      const fullPath = path.join(ENGINE_DIR, entry);
      return {
        basename: entry,
        fullPath,
        mtimeMs: ctx.statSync(fullPath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

/**
 * @param {VsixFile[]} before
 * @param {VsixFile[]} after
 * @returns {VsixFile | null}
 */
function selectGeneratedVsix(before, after) {
  const beforeIndex = new Map(before.map((file) => [file.basename, file.mtimeMs]));

  for (const file of after) {
    const previousMtime = beforeIndex.get(file.basename);
    if (previousMtime === undefined || file.mtimeMs > previousMtime) {
      return file;
    }
  }

  return null;
}

/**
 * @param {string} target
 * @param {{ skipNativeBuild?: boolean }} options
 * @param {ReturnType<typeof createContext>} ctx
 */
function ensureNativeBinary(target, options, ctx) {
  const nodePath = resolveNodeBinaryPath(target);

  if (ctx.existsSync(nodePath)) {
    return {
      built: false,
      path: nodePath,
    };
  }

  if (options.skipNativeBuild) {
    throw new Error(`Native binary missing: ${nodePath}`);
  }

  if (ctx.currentPlatformKey !== target) {
    throw new Error(
      `Native binary missing: ${nodePath}\n` +
        `Cross-platform packaging requires a prebuilt ${path.basename(nodePath)}. ` +
        `Current host platform is ${ctx.currentPlatformKey}.`,
    );
  }

  ctx.log(`⚙️  Native binary missing, building ${target} via pnpm run build:napi...`);
  ctx.runPnpm(path.join(ENGINE_DIR, 'packages', 'host-napi'), ['run', 'build:napi']);

  if (!ctx.existsSync(nodePath)) {
    throw new Error(
      `Native binary build finished but ${path.basename(nodePath)} was not produced.`,
    );
  }

  return {
    built: true,
    path: nodePath,
  };
}

/**
 * @param {string} target
 * @param {ReturnType<typeof createContext>} ctx
 */
function pruneOtherNativeBinaries(target, ctx) {
  const targetConfig = getTargetConfig(target);
  if (!targetConfig) {
    throw new Error(`Unknown target "${target}"`);
  }

  for (const entry of ctx.readdirSync(NAPI_DIR)) {
    if (!entry.startsWith('neko-engine.') || !entry.endsWith('.node')) {
      continue;
    }

    if (entry === targetConfig.nodeFile) {
      continue;
    }

    ctx.unlinkSync(path.join(NAPI_DIR, entry));
    ctx.log(`  [clean] ${entry}`);
  }
}

/**
 * @param {string | null} target
 * @param {{ skipNativeBuild?: boolean }} [options]
 * @param {ReturnType<typeof createContext>} [ctx]
 * @returns {VsixFile}
 */
function packageTarget(target, options = {}, ctx = createContext()) {
  assertTarget(target);

  const beforeVsixFiles = listVsixFiles(ctx);
  const nativeBinary = ensureNativeBinary(target, options, ctx);

  ctx.log(`🔨 Packaging neko-engine for: ${target}`);
  ctx.log(
    `✅ Native binary: ${path.basename(nativeBinary.path)}${nativeBinary.built ? ' (rebuilt)' : ''}`,
  );
  ctx.log('🧹 Cleaning other platform artifacts...');
  pruneOtherNativeBinaries(target, ctx);

  ctx.log('📦 Bundling FFmpeg runtime...');
  ctx.runNodeScript('bundle-ffmpeg.js', ['--platform', target]);

  ctx.log('⚙️  Compiling TypeScript...');
  ctx.runPnpm(ENGINE_DIR, ['run', 'compile']);

  ctx.log('📦 Creating platform VSIX...');
  ctx.runNpx(ENGINE_DIR, ['@vscode/vsce', 'package', '--no-dependencies', '--target', target]);

  const generatedVsix = selectGeneratedVsix(beforeVsixFiles, listVsixFiles(ctx));
  if (!generatedVsix) {
    throw new Error(`VSIX packaging finished but no updated artifact was found in ${ENGINE_DIR}.`);
  }

  ctx.log(`✅ VSIX: ${generatedVsix.basename}`);
  return generatedVsix;
}

function printUsage() {
  console.log(
    [
      'Package neko-engine VSIX for a specific platform.',
      '',
      'Usage:',
      '  node scripts/package-platform.js --target <target>',
      '  node scripts/package-platform.js <target>',
      '',
      `Targets: ${getSupportedTargets().join(', ')}`,
      '',
      'Options:',
      '  --skip-native-build  Do not build host-napi automatically when the host target is missing',
      '  --help               Print this help message',
    ].join('\n'),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  try {
    packageTarget(args.target, { skipNativeBuild: args.skipNativeBuild });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ensureNativeBinary,
  packageTarget,
  parseArgs,
};

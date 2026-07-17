'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');

const {
  ENGINE_DIR,
  NAPI_DIR,
  resolveNodeBinaryPath,
} = require('./package-config');
const {
  ensureNativeBinary,
  packageTarget,
  parseArgs,
} = require('./package-platform');

test('package-platform parses target from either positional or named flag', () => {
  assert.deepEqual(parseArgs(['darwin-arm64']), {
    help: false,
    skipNativeBuild: false,
    target: 'darwin-arm64',
  });
  assert.deepEqual(parseArgs(['--', 'darwin-arm64']), {
    help: false,
    skipNativeBuild: false,
    target: 'darwin-arm64',
  });
  assert.deepEqual(parseArgs(['--target', 'linux-x64', '--skip-native-build']), {
    help: false,
    skipNativeBuild: true,
    target: 'linux-x64',
  });
});

test('ensureNativeBinary auto-builds the host target when the native artifact is missing', () => {
  const nativeBinaryPath = resolveNodeBinaryPath('darwin-arm64');
  const existingFiles = new Set();
  const commands = [];

  const result = ensureNativeBinary(
    'darwin-arm64',
    {},
    {
      currentPlatformKey: 'darwin-arm64',
      existsSync(filePath) {
        return existingFiles.has(filePath);
      },
      log(message) {
        commands.push(`log:${message}`);
      },
      runPnpm(cwd, args) {
        commands.push(`pnpm:${cwd}:${args.join(' ')}`);
        existingFiles.add(nativeBinaryPath);
      },
    },
  );

  assert.equal(result.built, true);
  assert.equal(result.path, nativeBinaryPath);
  assert.deepEqual(commands, [
    'log:⚙️  Native binary missing, building darwin-arm64 via pnpm run build:napi...',
    `pnpm:${path.join(ENGINE_DIR, 'packages', 'host-napi')}:run build:napi`,
  ]);
});

test('packageTarget executes the packaging steps in a stable order', () => {
  const nativeBinaryPath = resolveNodeBinaryPath('darwin-arm64');
  const recorded = [];
  let vsixGenerated = false;

  const result = packageTarget(
    'darwin-arm64',
    {},
    {
      currentPlatformKey: 'darwin-arm64',
      existsSync(filePath) {
        return filePath === nativeBinaryPath || (vsixGenerated && filePath.endsWith('neko-engine-0.0.1-darwin-arm64.vsix'));
      },
      log(message) {
        recorded.push(`log:${message}`);
      },
      readdirSync(dirPath) {
        if (dirPath === NAPI_DIR) {
          return ['neko-engine.darwin-arm64.node', 'neko-engine.linux-x64-gnu.node'];
        }

        if (dirPath === ENGINE_DIR) {
          return vsixGenerated ? ['neko-engine-0.0.1-darwin-arm64.vsix'] : [];
        }

        return [];
      },
      runNodeScript(scriptName, args) {
        recorded.push(`node:${scriptName}:${args.join(' ')}`);
      },
      runNpx(cwd, args) {
        recorded.push(`npx:${cwd}:${args.join(' ')}`);
        vsixGenerated = true;
      },
      runPnpm(cwd, args) {
        recorded.push(`pnpm:${cwd}:${args.join(' ')}`);
      },
      statSync() {
        return {
          mtimeMs: 2,
        };
      },
      unlinkSync(filePath) {
        recorded.push(`unlink:${path.basename(filePath)}`);
      },
    },
  );

  assert.equal(result.basename, 'neko-engine-0.0.1-darwin-arm64.vsix');
  assert.deepEqual(recorded, [
    'log:🔨 Packaging neko-engine for: darwin-arm64',
    'log:✅ Native binary: neko-engine.darwin-arm64.node',
    'log:🧹 Cleaning other platform artifacts...',
    'unlink:neko-engine.linux-x64-gnu.node',
    'log:  [clean] neko-engine.linux-x64-gnu.node',
    'log:📦 Bundling FFmpeg runtime...',
    'node:bundle-ffmpeg.js:--platform darwin-arm64',
    'log:⚙️  Compiling TypeScript...',
    `pnpm:${ENGINE_DIR}:run compile`,
    'log:📦 Creating platform VSIX...',
    `npx:${ENGINE_DIR}:@vscode/vsce package --no-dependencies --target darwin-arm64`,
    'log:✅ VSIX: neko-engine-0.0.1-darwin-arm64.vsix',
  ]);
});

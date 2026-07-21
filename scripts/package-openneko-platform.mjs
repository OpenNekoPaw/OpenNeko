#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';

import {
  OPENNEKO_FEATURE_PACKAGES,
  composeOpenNekoManifest,
  mergeOpenNekoLocalization,
  openNekoArtifactName,
} from './openneko-vsix-contract.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const appRoot = join(repoRoot, 'apps', 'neko-vscode');
const require = createRequire(import.meta.url);
const { getTargetConfig } = require('../packages/neko-engine/scripts/package-config.js');

export function parseOpenNekoPackageArgs(argv) {
  const targetIndex = argv.indexOf('--target');
  const engineIndex = argv.indexOf('--engine-vsix');
  return {
    target: targetIndex >= 0 ? argv[targetIndex + 1] : undefined,
    engineVsix: engineIndex >= 0 ? argv[engineIndex + 1] : undefined,
  };
}

export function resolveHostTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  throw new Error(
    `The current host ${platform}-${arch} is not a supported OpenNeko package target.`,
  );
}

export function assertEmbeddedNativeClosure(files, target) {
  const nativeFiles = files.filter((file) => /neko-engine\.[^.]+\.node$/u.test(file));
  const targetConfig = getTargetConfig(target);
  if (!targetConfig) {
    throw new Error(`Unsupported OpenNeko native target: ${target}`);
  }
  const expected = targetConfig.nodeFile;
  if (nativeFiles.length !== 1 || basename(nativeFiles[0]) !== expected) {
    throw new Error(
      `OpenNeko ${target} native closure must contain only ${expected}; received ${nativeFiles.join(', ') || '<none>'}.`,
    );
  }
  const runtimeLibraries = files.filter((file) =>
    target === 'darwin-arm64' ? file.endsWith('.dylib') : /\.so(?:\.|$)/u.test(file),
  );
  if (runtimeLibraries.length === 0) {
    throw new Error(
      `OpenNeko ${target} native closure does not contain an FFmpeg runtime library.`,
    );
  }
  return Object.freeze({
    nativeFile: nativeFiles[0],
    runtimeLibraryCount: runtimeLibraries.length,
  });
}

export function createComposedManifest() {
  const appManifest = readJson(join(appRoot, 'package.json'));
  const featureManifests = OPENNEKO_FEATURE_PACKAGES.map((packageName) => [
    packageName,
    readJson(join(repoRoot, 'packages', packageName, 'package.json')),
  ]);
  const manifest = composeOpenNekoManifest({ appManifest, featureManifests });
  delete manifest.dependencies;
  delete manifest.devDependencies;
  delete manifest.scripts;
  delete manifest.private;
  return manifest;
}

export function packageOpenNekoPlatform({ target, engineVsix }, command = runCommand) {
  const manifest = createComposedManifest();
  const version = manifest.version;
  const buildRoot = join(repoRoot, '.tmp', 'openneko-vsix', target);
  const payloadRoot = join(buildRoot, 'payloads');
  const extractRoot = join(buildRoot, 'extracted');
  const stageRoot = join(buildRoot, 'stage');
  const artifactRoot = join(repoRoot, 'vsix-artifacts');
  rmSync(buildRoot, { recursive: true, force: true });
  mkdirSync(payloadRoot, { recursive: true });
  mkdirSync(extractRoot, { recursive: true });
  mkdirSync(stageRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });

  command('pnpm', ['--dir', 'apps/neko-vscode', 'run', 'compile'], repoRoot);

  const payloads = new Map();
  for (const packageName of OPENNEKO_FEATURE_PACKAGES) {
    if (packageName === 'neko-engine') continue;
    const outputPath = join(payloadRoot, `${packageName}.vsix`);
    command(
      'pnpm',
      [
        '--dir',
        `packages/${packageName}`,
        'exec',
        'vsce',
        'package',
        '--no-dependencies',
        '--allow-missing-repository',
        '--skip-license',
        '--out',
        outputPath,
      ],
      repoRoot,
    );
    assertFile(outputPath, `Feature payload was not produced: ${packageName}`);
    payloads.set(packageName, outputPath);
  }

  const resolvedEngineVsix = resolveEngineVsix(target, engineVsix);
  payloads.set('neko-engine', resolvedEngineVsix);

  for (const packageName of OPENNEKO_FEATURE_PACKAGES) {
    const payloadPath = payloads.get(packageName);
    if (!payloadPath) throw new Error(`Missing embedded feature payload: ${packageName}`);
    const featureExtractRoot = join(extractRoot, packageName);
    command('unzip', ['-q', '-o', payloadPath, '-d', featureExtractRoot], repoRoot);
    const extensionRoot = join(featureExtractRoot, 'extension');
    assertDirectory(extensionRoot, `VSIX payload has no extension root: ${payloadPath}`);
    cpSync(extensionRoot, join(stageRoot, 'dist', 'features', packageName), { recursive: true });
  }

  assertEmbeddedNativeClosure(
    listFiles(join(stageRoot, 'dist', 'features', 'neko-engine')),
    target,
  );
  cpSync(join(appRoot, 'dist', 'extension.js'), join(stageRoot, 'dist', 'extension.js'));
  cpSync(join(appRoot, 'README.md'), join(stageRoot, 'README.md'));
  cpSync(join(appRoot, 'LICENSE'), join(stageRoot, 'LICENSE'));
  writeJson(join(stageRoot, 'package.json'), manifest);
  writeMergedLocalizations(stageRoot);

  const artifactPath = join(artifactRoot, openNekoArtifactName(target, version));
  rmSync(artifactPath, { force: true });
  command(
    'pnpm',
    [
      'exec',
      'vsce',
      'package',
      '--no-dependencies',
      '--allow-missing-repository',
      '--target',
      target,
      '--out',
      artifactPath,
    ],
    stageRoot,
  );
  assertFile(artifactPath, `Final OpenNeko VSIX was not produced: ${artifactPath}`);
  rmSync(buildRoot, { recursive: true, force: true });
  process.stdout.write(`OpenNeko VSIX: ${artifactPath}\n`);
  return Object.freeze({ artifactPath, target, version });
}

function resolveEngineVsix(target, explicitPath) {
  if (explicitPath) {
    const path = resolve(repoRoot, explicitPath);
    assertFile(path, `Engine VSIX does not exist: ${path}`);
    return path;
  }
  const matches = readdirSync(join(repoRoot, 'packages', 'neko-engine'))
    .filter((entry) => entry.startsWith(`neko-engine-${target}-`) && entry.endsWith('.vsix'))
    .map((entry) => join(repoRoot, 'packages', 'neko-engine', entry));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one neko-engine ${target} VSIX; received ${matches.join(', ') || '<none>'}. Build the Engine target first or pass --engine-vsix.`,
    );
  }
  return matches[0];
}

function writeMergedLocalizations(stageRoot) {
  for (const fileName of ['package.nls.json', 'package.nls.zh-cn.json']) {
    const entries = [];
    for (const packageName of OPENNEKO_FEATURE_PACKAGES) {
      const path = join(repoRoot, 'packages', packageName, fileName);
      if (existsSync(path)) entries.push([`${packageName}/${fileName}`, readJson(path)]);
    }
    if (entries.length > 0)
      writeJson(join(stageRoot, fileName), mergeOpenNekoLocalization(entries));
  }
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertFile(path, message) {
  if (!existsSync(path)) throw new Error(message);
}

function assertDirectory(path, message) {
  if (!existsSync(path)) throw new Error(message);
}

function runCommand(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function main() {
  const args = parseOpenNekoPackageArgs(process.argv.slice(2));
  packageOpenNekoPlatform({
    target: args.target ?? resolveHostTarget(),
    engineVsix: args.engineVsix,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

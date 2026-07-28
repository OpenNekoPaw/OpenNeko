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
import { join, resolve } from 'node:path';

import {
  OPENNEKO_FEATURE_PACKAGES,
  composeOpenNekoManifest,
  mergeOpenNekoLocalization,
  openNekoArtifactName,
} from './openneko-vsix-contract.mjs';
import { assertEmbeddedRuntimeClosure } from './embedded-runtime-closure.mjs';
import {
  assertStagedMediaRuntime,
  stagePackagedMediaRuntime,
} from './media-runtime-closure.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const appRoot = join(repoRoot, 'apps', 'neko-vscode');

export function parseOpenNekoPackageArgs(argv) {
  const targetIndex = argv.indexOf('--target');
  return {
    target: targetIndex >= 0 ? argv[targetIndex + 1] : undefined,
  };
}

export function resolveHostTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  throw new Error(
    `The current host ${platform}-${arch} is not a supported OpenNeko package target.`,
  );
}

export function assertOpenNekoPayloadClosure(files, target) {
  const buildInputFiles = files.filter((file) =>
    file.replaceAll('\\', '/').split('/').includes('deps'),
  );
  if (buildInputFiles.length > 0) {
    throw new Error(
      `OpenNeko ${target} payload contains build-only dependency files: ${buildInputFiles.join(', ')}.`,
    );
  }
  const engineFiles = files.filter((file) => /(?:^|[/\\])neko-engine(?:[/\\.]|$)/u.test(file));
  if (engineFiles.length > 0) {
    throw new Error(
      `OpenNeko ${target} payload contains retired Engine files: ${engineFiles.join(', ')}.`,
    );
  }
  return Object.freeze({ fileCount: files.length });
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

function packageOpenNekoPlatform({ target }, command = runCommand) {
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

  for (const packageName of OPENNEKO_FEATURE_PACKAGES) {
    const payloadPath = payloads.get(packageName);
    if (!payloadPath) throw new Error(`Missing embedded feature payload: ${packageName}`);
    const featureExtractRoot = join(extractRoot, packageName);
    command('unzip', ['-q', '-o', payloadPath, '-d', featureExtractRoot], repoRoot);
    const extensionRoot = join(featureExtractRoot, 'extension');
    assertDirectory(extensionRoot, `VSIX payload has no extension root: ${payloadPath}`);
    cpSync(extensionRoot, join(stageRoot, 'dist', 'features', packageName), { recursive: true });
  }

  stageOpenNekoApplicationRuntime(stageRoot);
  stagePackagedMediaRuntime(stageRoot, target, process.env.NEKO_MEDIA_RUNTIME_ROOT?.trim());
  assertOpenNekoPayloadClosure(listFiles(stageRoot), target);
  assertEmbeddedRuntimeClosure(stageRoot, target);
  assertStagedMediaRuntime(stageRoot, target, { qualify: true });
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

export function stageOpenNekoApplicationRuntime(stageRoot) {
  const sourceDist = join(appRoot, 'dist');
  const targetDist = join(stageRoot, 'dist');
  const sourceBundle = join(sourceDist, 'extension.js');
  const sourceManifest = join(sourceDist, 'runtime-closure.json');
  const sourceNodeModules = join(sourceDist, 'node_modules');
  assertFile(sourceBundle, 'OpenNeko application bundle is missing.');
  assertFile(sourceManifest, 'OpenNeko application runtime closure manifest is missing.');
  assertDirectory(sourceNodeModules, 'OpenNeko application runtime node_modules is missing.');
  mkdirSync(targetDist, { recursive: true });
  rmSync(join(targetDist, 'node_modules'), { recursive: true, force: true });
  cpSync(sourceBundle, join(targetDist, 'extension.js'));
  cpSync(sourceManifest, join(targetDist, 'runtime-closure.json'));
  cpSync(sourceNodeModules, join(targetDist, 'node_modules'), { recursive: true });
}

export function writeMergedLocalizations(stageRoot) {
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

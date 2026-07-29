#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import {
  assertCanonicalOpenNekoManifest,
  openNekoArtifactName,
} from './openneko-vsix-contract.mjs';
import { assertApplicationRuntimeClosure } from './application-runtime-closure.mjs';
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
  const internalExtensionPayloads = files.filter((file) =>
    /(?:^|[/\\])dist[/\\]features[/\\][^/\\]+[/\\](?:package\.json|extension\.js)$/u.test(
      file,
    ),
  );
  if (internalExtensionPayloads.length > 0) {
    throw new Error(
      `OpenNeko ${target} payload contains internal extension entries: ${internalExtensionPayloads.join(', ')}.`,
    );
  }
  const internalArchives = files.filter((file) => file.endsWith('.vsix'));
  if (internalArchives.length > 0) {
    throw new Error(
      `OpenNeko ${target} payload contains internal VSIX archives: ${internalArchives.join(', ')}.`,
    );
  }
  return Object.freeze({ fileCount: files.length });
}

export function createComposedManifest() {
  const manifest = structuredClone(readJson(join(appRoot, 'package.json')));
  assertCanonicalOpenNekoManifest(manifest);
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
  const stageRoot = join(buildRoot, 'stage');
  const artifactRoot = join(repoRoot, 'vsix-artifacts');
  rmSync(buildRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });
  mkdirSync(artifactRoot, { recursive: true });

  command('pnpm', ['--dir', 'apps/neko-vscode', 'run', 'compile'], repoRoot);

  stageOpenNekoApplicationRuntime(stageRoot);
  stagePackagedMediaRuntime(stageRoot, target, process.env.NEKO_MEDIA_RUNTIME_ROOT?.trim());
  assertOpenNekoPayloadClosure(listFiles(stageRoot), target);
  assertApplicationRuntimeClosure(stageRoot, target);
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
  rmSync(targetDist, { recursive: true, force: true });
  cpSync(sourceDist, targetDist, { recursive: true });
}

export function writeMergedLocalizations(stageRoot) {
  for (const fileName of [
    'package.nls.json',
    'package.nls.zh-cn.json',
    'l10n/bundle.l10n.json',
    'l10n/bundle.l10n.zh-cn.json',
  ]) {
    const source = join(appRoot, fileName);
    if (existsSync(source)) {
      const target = join(stageRoot, fileName);
      mkdirSync(resolve(target, '..'), { recursive: true });
      cpSync(source, target);
    }
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
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(message);
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

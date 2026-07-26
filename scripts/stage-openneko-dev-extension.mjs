#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { OPENNEKO_FEATURE_PACKAGES } from './openneko-vsix-contract.mjs';
import {
  createComposedManifest,
  stageOpenNekoApplicationRuntime,
  writeMergedLocalizations,
} from './package-openneko-platform.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const applicationRoot = join(repositoryRoot, 'apps', 'neko-vscode');

export const OPENNEKO_DEV_STAGE_ROOT = join(repositoryRoot, '.tmp', 'openneko-vscode-dev');

export function stageOpenNekoDevExtension(stageRoot = OPENNEKO_DEV_STAGE_ROOT) {
  const featureRoots = OPENNEKO_FEATURE_PACKAGES.map((packageName) => {
    const root = join(repositoryRoot, 'packages', packageName);
    const manifest = readJson(join(root, 'package.json'));
    assertFile(
      join(root, manifest.main ?? 'dist/extension.js'),
      `Build ${packageName} before staging the development extension.`,
    );
    return [packageName, root];
  });

  rmSync(stageRoot, { recursive: true, force: true });
  const featureStageRoot = join(stageRoot, 'dist', 'features');
  mkdirSync(featureStageRoot, { recursive: true });

  stageOpenNekoApplicationRuntime(stageRoot);
  cpSync(join(applicationRoot, 'README.md'), join(stageRoot, 'README.md'));
  cpSync(join(applicationRoot, 'LICENSE'), join(stageRoot, 'LICENSE'));
  writeJson(join(stageRoot, 'package.json'), createComposedManifest());
  writeMergedLocalizations(stageRoot);

  for (const [packageName, sourceRoot] of featureRoots) {
    const target = join(featureStageRoot, packageName);
    symlinkSync(relative(dirname(target), sourceRoot), target, 'dir');
  }

  return Object.freeze({
    stageRoot,
    featurePackages: Object.freeze(featureRoots.map(([packageName]) => packageName)),
  });
}

function buildOpenNekoDevExtension() {
  execFileSync(
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'compile',
      '--force',
      ...OPENNEKO_FEATURE_PACKAGES.map((packageName) => `--filter=${packageName}`),
    ],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    },
  );
  execFileSync('pnpm', ['--dir', 'apps/neko-vscode', 'run', 'compile'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  return stageOpenNekoDevExtension();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function assertFile(path, message) {
  if (!existsSync(path)) throw new Error(`${message} Missing: ${path}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--build');
    if (unknownArguments.length > 0) {
      throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
    }
    const result = process.argv.includes('--build')
      ? buildOpenNekoDevExtension()
      : stageOpenNekoDevExtension();
    process.stdout.write(
      `OpenNeko development extension staged at ${result.stageRoot} with ${result.featurePackages.length} features.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

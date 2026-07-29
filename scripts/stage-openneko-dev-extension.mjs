#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  createComposedManifest,
  stageOpenNekoApplicationRuntime,
  writeMergedLocalizations,
} from './package-openneko-platform.mjs';
import { stageDevelopmentMediaRuntime } from './media-runtime-closure.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const applicationRoot = join(repositoryRoot, 'apps', 'neko-vscode');

export const OPENNEKO_DEV_STAGE_ROOT = join(repositoryRoot, '.tmp', 'openneko-vscode-dev');

export function stageOpenNekoDevExtension(stageRoot = OPENNEKO_DEV_STAGE_ROOT) {
  rmSync(stageRoot, { recursive: true, force: true });

  stageOpenNekoApplicationRuntime(stageRoot);
  stageDevelopmentMediaRuntime(stageRoot, resolveHostTarget());
  cpSync(join(applicationRoot, 'README.md'), join(stageRoot, 'README.md'));
  cpSync(join(applicationRoot, 'LICENSE'), join(stageRoot, 'LICENSE'));
  writeJson(join(stageRoot, 'package.json'), createComposedManifest());
  writeMergedLocalizations(stageRoot);

  return Object.freeze({
    stageRoot,
  });
}

function resolveHostTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  throw new Error(`Unsupported OpenNeko development target ${platform}-${arch}.`);
}

function buildOpenNekoDevExtension() {
  execFileSync('pnpm', ['--dir', 'apps/neko-vscode', 'run', 'compile'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  return stageOpenNekoDevExtension();
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    process.stdout.write(`OpenNeko development extension staged at ${result.stageRoot}.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

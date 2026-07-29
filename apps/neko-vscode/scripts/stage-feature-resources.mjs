#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const applicationRoot = resolve(import.meta.dirname, '..');
const featureStageRoot = join(applicationRoot, 'dist', 'features');

const featureResources = Object.freeze([
  {
    id: 'neko-tools',
    build: [
      ['pnpm', ['--dir', 'packages/neko-tools-webview', 'run', 'build']],
    ],
    copies: [
      ['packages/neko-tools-webview/dist', 'dist/webview'],
      ['apps/neko-vscode/resources/features/neko-tools/themes', 'themes'],
    ],
  },
  {
    id: 'neko-preview',
    build: [
      ['pnpm', ['--dir', 'packages/neko-preview-webview', 'run', 'build']],
    ],
    copies: [['packages/neko-preview-webview/dist', 'dist/webview']],
  },
  {
    id: 'neko-assets',
    build: [],
    copies: [],
  },
  {
    id: 'neko-cut',
    build: [
      ['pnpm', ['--dir', 'packages/neko-cut-webview', 'run', 'build']],
    ],
    copies: [['packages/neko-cut-webview/dist', 'dist/webview']],
  },
  {
    id: 'neko-canvas',
    build: [
      ['pnpm', ['--dir', 'packages/neko-canvas-webview', 'run', 'build']],
    ],
    copies: [['packages/neko-canvas-webview/dist', 'dist/webview']],
  },
  {
    id: 'neko-agent',
    build: [
      ['pnpm', ['--dir', 'packages/neko-agent-webview', 'run', 'build']],
    ],
    copies: [
      ['packages/neko-agent-webview/dist', 'dist/webview'],
      ['packages/neko-skills/skills', 'dist/skills'],
    ],
  },
]);

export function stageFeatureResources({ build = false } = {}) {
  if (build) {
    for (const feature of featureResources) {
      for (const [command, args] of feature.build) {
        execFileSync(command, args, { cwd: repositoryRoot, stdio: 'inherit' });
      }
    }
  }

  rmSync(featureStageRoot, { recursive: true, force: true });
  mkdirSync(featureStageRoot, { recursive: true });
  for (const feature of featureResources) {
    const targetRoot = join(featureStageRoot, feature.id);
    mkdirSync(targetRoot, { recursive: true });
    for (const [source, target] of feature.copies) {
      const sourcePath = join(repositoryRoot, source);
      if (!existsSync(sourcePath)) {
        throw new Error(
          `Feature resource ${feature.id}/${target} is missing. Run with --build.`,
        );
      }
      cpSync(sourcePath, join(targetRoot, target), { recursive: true });
    }
  }

  return Object.freeze({
    featureStageRoot,
    featureIds: Object.freeze(featureResources.map(({ id }) => id)),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const unknown = args.filter((argument) => argument !== '--build');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }
  const result = stageFeatureResources({ build: args.includes('--build') });
  process.stdout.write(
    `Staged ${result.featureIds.length} app-owned feature resource roots in ${result.featureStageRoot}.\n`,
  );
}

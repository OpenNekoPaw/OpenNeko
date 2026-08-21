#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stagePackagedDshRuntime } from './dsh-runtime-closure.mjs';
import { prepareDshDevelopmentRuntime } from './prepare-dsh-development-runtime.mjs';

const arguments_ = process.argv.slice(2);
const stageRoot = resolve(
  arguments_.find((argument) => !argument.startsWith('--')) ??
    fileURLToPath(new URL('../apps/neko-desktop/.dsh-runtime-stage', import.meta.url)),
);
const developmentBuild = arguments_.includes('--development');
const runtimeSourceRoot =
  process.env['NEKO_DSH_RUNTIME_ROOT'] ??
  (developmentBuild ? prepareDshDevelopmentRuntime() : undefined);
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stageRoot, { recursive: true });
const staged = stagePackagedDshRuntime(
  stageRoot,
  'darwin-arm64',
  runtimeSourceRoot,
);
process.stdout.write(`Staged verified DSH runtime at ${staged.runtimeRoot}.\n`);

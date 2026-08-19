#!/usr/bin/env node

import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { stagePackagedDshRuntime } from './dsh-runtime-closure.mjs';

const stageRoot = resolve(process.argv[2] ?? 'apps/neko-desktop/.vite/runtime-stage');
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stageRoot, { recursive: true });
const staged = stagePackagedDshRuntime(
  stageRoot,
  'darwin-arm64',
  process.env['NEKO_DSH_RUNTIME_ROOT'],
);
process.stdout.write(`Staged verified DSH runtime at ${staged.runtimeRoot}.\n`);

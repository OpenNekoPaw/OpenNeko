#!/usr/bin/env node

import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stagePackagedDshRuntime } from './dsh-runtime-closure.mjs';
import { prepareDshDevelopmentRuntime } from './prepare-dsh-development-runtime.mjs';

const arguments_ = process.argv.slice(2);
const builtinSkillSourceRoot = fileURLToPath(new URL('../packages/skills/skills', import.meta.url));
const releaseHiddenSkills = new Set(['character-creator', 'world-creator']);

export function stageReleaseBuiltinSkills(sourceRoot, stageRoot) {
  mkdirSync(stageRoot, { recursive: true });
  const stagedNames = [];
  for (const name of readdirSync(sourceRoot).sort()) {
    if (releaseHiddenSkills.has(name)) continue;
    cpSync(join(sourceRoot, name), join(stageRoot, name), {
      recursive: true,
      errorOnExist: true,
    });
    stagedNames.push(name);
  }
  return Object.freeze(stagedNames);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
  const staged = stagePackagedDshRuntime(stageRoot, 'darwin-arm64', runtimeSourceRoot);
  const builtinSkillStageRoot = join(stageRoot, 'skills');
  stageReleaseBuiltinSkills(builtinSkillSourceRoot, builtinSkillStageRoot);
  process.stdout.write(`Staged verified DSH runtime at ${staged.runtimeRoot}.\n`);
  process.stdout.write(`Staged Release builtin Skills at ${builtinSkillStageRoot}.\n`);
}

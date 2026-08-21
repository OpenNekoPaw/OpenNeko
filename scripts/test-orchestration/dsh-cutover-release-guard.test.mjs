import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

test('allows local validation packages while keeping release make blocked', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'apps/neko-desktop/package.json'), 'utf8'),
  );
  for (const name of ['build', 'package']) {
    assert.match(
      manifest.scripts[name],
      /^node \.\.\/\.\.\/scripts\/assert-supported-desktop-host\.mjs && node \.\.\/\.\.\/scripts\/prepare-dsh-runtime-stage\.mjs --development &&/u,
    );
    assert.doesNotMatch(manifest.scripts[name], /assert-dsh-cutover-release-ready/u);
  }
  assert.match(
    manifest.scripts.make,
    /^node \.\.\/\.\.\/scripts\/assert-dsh-cutover-release-ready\.mjs &&/u,
  );

  const result = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, 'scripts/assert-dsh-cutover-release-ready.mjs')],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /integration-only/u);
});

test('keeps the Q0 fixture outside every Desktop product artifact input', () => {
  const forge = readFileSync(resolve(repositoryRoot, 'apps/neko-desktop/forge.config.ts'), 'utf8');
  const stage = readFileSync(
    resolve(repositoryRoot, 'scripts/prepare-dsh-runtime-stage.mjs'),
    'utf8',
  );
  const closure = readFileSync(resolve(repositoryRoot, 'scripts/dsh-runtime-closure.mjs'), 'utf8');
  const developmentBuilder = readFileSync(
    resolve(repositoryRoot, 'scripts/prepare-dsh-development-runtime.mjs'),
    'utf8',
  );
  const q0Manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'scripts/dsh-q0/package.json'), 'utf8'),
  );

  for (const source of [forge, stage, closure, developmentBuilder]) {
    assert.doesNotMatch(source, /scripts\/dsh-q0|dsh-q0/u);
  }
  assert.doesNotMatch(
    JSON.stringify(q0Manifest),
    /electron-forge|apps\/neko-desktop|runtime-stage/u,
  );
  assert.match(stage, /NEKO_DSH_RUNTIME_ROOT/u);
  assert.match(stage, /prepareDshDevelopmentRuntime/u);
  assert.match(stage, /--development/u);
  assert.match(closure, /verified DSH runtime closure/u);
  assert.doesNotMatch(forge, /prepare-dsh-development-runtime/u);
});

test('keeps release and tag automation unavailable while the guard is integration-only', () => {
  const workflowsRoot = resolve(repositoryRoot, '.github/workflows');
  const workflowFiles = readdirSync(workflowsRoot).filter((name) => /\.ya?ml$/u.test(name));
  assert.deepEqual(workflowFiles, ['ci.yml']);
  const workflows = workflowFiles
    .map((name) => readFileSync(resolve(workflowsRoot, name), 'utf8'))
    .join('\n');
  for (const forbidden of [
    'package:desktop',
    'make:desktop',
    'electron-forge',
    'gh release create',
    'git tag',
    'scripts/dsh-q0',
  ]) {
    assert.doesNotMatch(
      workflows,
      new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    );
  }
});

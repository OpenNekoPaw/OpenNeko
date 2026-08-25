import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

test('routes every Desktop package and release build through one verified runtime stage', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'apps/neko-desktop/package.json'), 'utf8'),
  );
  for (const name of ['build', 'make', 'package']) {
    assert.match(
      manifest.scripts[name],
      /^node \.\.\/\.\.\/scripts\/assert-supported-desktop-host\.mjs && node \.\.\/\.\.\/scripts\/prepare-dsh-runtime-stage\.mjs &&/u,
    );
    assert.doesNotMatch(manifest.scripts[name], /assert-dsh-cutover-release-ready/u);
  }
  assert.equal(
    existsSync(resolve(repositoryRoot, 'scripts/assert-dsh-cutover-release-ready.mjs')),
    false,
  );
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
  assert.match(
    stage,
    /process\.env\['NEKO_DSH_RUNTIME_ROOT'\] \?\? prepareDshDevelopmentRuntime\(\)/u,
  );
  assert.doesNotMatch(stage, /--development/u);
  assert.match(closure, /verified DSH runtime closure/u);
  assert.doesNotMatch(forge, /prepare-dsh-development-runtime/u);
});

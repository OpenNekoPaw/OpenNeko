import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const NATIVE_TASK_IDS = new Set([
  '@neko-engine/host-cli#build:native',
  '@neko-engine/host-napi#build:native',
]);

test('Engine release build owns one sequential native workflow', async () => {
  const plan = JSON.parse(
    execFileSync('pnpm', ['turbo', 'run', 'build', '--filter=neko-engine', '--dry=json'], {
      encoding: 'utf8',
    }),
  );
  const engineTask = plan.tasks.find((task) => task.taskId === 'neko-engine#build');
  assert.ok(engineTask, 'neko-engine#build must be present in the Turbo plan');

  const nativeTasks = plan.tasks.filter((task) => NATIVE_TASK_IDS.has(task.taskId));
  assert.deepEqual(
    nativeTasks,
    [],
    'native host tasks must not be scheduled separately from neko-engine#build',
  );
  assert.match(
    engineTask.command,
    /^pnpm run build:cli && pnpm run build:napi && pnpm run compile$/u,
    'neko-engine#build must run CLI before N-API before TypeScript compilation',
  );

  const [packageManifest, turboConfiguration] = await Promise.all([
    readFile('packages/neko-engine/package.json', 'utf8').then(JSON.parse),
    readFile('turbo.json', 'utf8').then(JSON.parse),
  ]);
  assert.equal(packageManifest.scripts.build, engineTask.command);
  assert.equal(
    turboConfiguration.tasks['neko-engine#build'].cache,
    false,
    'Turbo must not cache a workflow whose native outputs are owned by Cargo',
  );
  assert.equal(turboConfiguration.tasks['@neko-engine/host-cli#build:native'].cache, false);
  assert.equal(turboConfiguration.tasks['@neko-engine/host-napi#build:native'].cache, false);
});

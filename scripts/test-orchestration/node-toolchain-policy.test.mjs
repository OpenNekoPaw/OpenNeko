import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Node toolchain pin is shared by every GitHub Actions workflow', async () => {
  const nodeVersion = (
    await readFile(path.join(repositoryRoot, '.node-version'), 'utf8')
  ).trim();
  assert.equal(nodeVersion, '24.18.0');

  const workflowDirectory = path.join(repositoryRoot, '.github/workflows');
  const workflowNames = (await readdir(workflowDirectory)).filter((name) =>
    name.endsWith('.yml'),
  );
  let setupNodeSteps = 0;

  for (const workflowName of workflowNames) {
    const workflow = parse(await readFile(path.join(workflowDirectory, workflowName), 'utf8'));
    for (const job of Object.values(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.uses !== 'string' || !step.uses.startsWith('actions/setup-node@')) {
          continue;
        }
        setupNodeSteps += 1;
        assert.equal(
          step.with?.['node-version-file'],
          '.node-version',
          `${workflowName} must read the root Node toolchain pin`,
        );
        assert.equal(
          Object.hasOwn(step.with ?? {}, 'node-version'),
          false,
          `${workflowName} must not declare a separate Node version`,
        );
      }
    }
  }

  assert.ok(setupNodeSteps > 0, 'expected at least one setup-node workflow step');
});

test('Exact development pin does not raise the Node 24 runtime contract', async () => {
  const [rootPackage, tuiPackage, tuiBuild] = await Promise.all([
    readFile(path.join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(repositoryRoot, 'apps/neko-tui/package.json'), 'utf8').then(JSON.parse),
    readFile(path.join(repositoryRoot, 'apps/neko-tui/tsup.config.ts'), 'utf8'),
  ]);

  assert.equal(rootPackage.engines?.node, '>=24.0.0');
  assert.equal(tuiPackage.engines?.node, '>=24.0.0');
  assert.match(tuiBuild, /target: 'node24'/u);
});

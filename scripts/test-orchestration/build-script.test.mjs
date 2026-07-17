import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

test('development build accepts an empty dev-only package group and forwards separate Turbo filters', async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'neko-build-script-'));
  const capturePath = path.join(temporaryDirectory, 'pnpm-arguments.json');
  const fakePnpmPath = path.join(temporaryDirectory, 'pnpm');

  try {
    await writeFile(
      fakePnpmPath,
      [
        '#!/usr/bin/env node',
        "const { writeFileSync } = require('node:fs');",
        'writeFileSync(process.env.NEKO_BUILD_CAPTURE, JSON.stringify(process.argv.slice(2)));',
      ].join('\n'),
    );
    await chmod(fakePnpmPath, 0o755);

    const result = spawnSync('bash', ['./build.sh', '--dev', '--skip-package'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NEKO_BUILD_CAPTURE: capturePath,
        PATH: `${temporaryDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });

    assert.equal(
      result.status,
      0,
      `build.sh exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );

    const packageGroups = JSON.parse(
      await readFile(path.join(repositoryRoot, 'scripts/package-groups.json'), 'utf8'),
    );
    const forwardedArguments = JSON.parse(await readFile(capturePath, 'utf8'));

    assert.deepEqual(forwardedArguments, [
      'exec',
      'turbo',
      'run',
      'compile',
      ...packageGroups.packages.buildRelease.map((packageName) => `--filter=${packageName}`),
    ]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

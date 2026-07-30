import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

test('CI and the prepared act image share the media runtime dependency list', async () => {
  const [ciSource, packageList, dockerfile] = await Promise.all([
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('scripts/act/media-runtime-packages.txt', 'utf8'),
    readFile('scripts/act/Dockerfile', 'utf8'),
  ]);
  const ciWorkflow = parse(ciSource);
  const mediaRuntimePackages = packageList.split(/\s+/u).filter(Boolean);

  assert.deepEqual(mediaRuntimePackages, ['ffmpeg']);
  for (const jobName of ['build', 'test-ts']) {
    const mediaRuntimeDependencyStep = ciWorkflow.jobs[jobName].steps.find(
      (step) => step.name === 'Install media runtime dependency',
    );
    assert.ok(
      mediaRuntimeDependencyStep,
      `expected the ${jobName} job to install the media runtime dependency`,
    );
    assert.match(mediaRuntimeDependencyStep.run, /scripts\/act\/media-runtime-packages\.txt/u);
    assert.equal(
      mediaRuntimeDependencyStep.if,
      "${{ env.ACT != 'true' || env.ACT_NATIVE_DEPS_READY != 'true' }}",
    );
  }
  assert.match(dockerfile, /COPY media-runtime-packages\.txt/u);
  assert.match(dockerfile, /xargs apt-get install -y/u);
});

test('Turbo actions cache remains remote-only when act uses direct cache mounts', async () => {
  const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  const turboCacheJobs = Object.entries(workflow.jobs)
    .filter(([, job]) =>
      job.steps?.some((step) => step.uses === 'actions/cache@v5' && step.with?.path === '.turbo'),
    )
    .map(([jobName]) => jobName);

  assert.deepEqual(turboCacheJobs, ['build', 'test-ts', 'code-quality']);
  for (const jobName of turboCacheJobs) {
    const cacheStep = workflow.jobs[jobName].steps.find(
      (step) => step.uses === 'actions/cache@v5' && step.with?.path === '.turbo',
    );
    assert.ok(cacheStep, `expected ${jobName} to retain its remote Turbo cache`);
    assert.equal(cacheStep.if, "${{ env.ACT != 'true' }}");
  }
});

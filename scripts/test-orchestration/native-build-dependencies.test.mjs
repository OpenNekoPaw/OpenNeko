import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

test('the workflow and prepared act image share the native build dependency list', async () => {
  const [workflowSource, packageList, dockerfile] = await Promise.all([
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('scripts/act/native-build-packages.txt', 'utf8'),
    readFile('scripts/act/Dockerfile', 'utf8'),
  ]);
  const workflow = parse(workflowSource);
  const nativeDependenciesStep = workflow.jobs.build.steps.find(
    (step) => step.name === 'Install native build dependencies',
  );
  const nativePackages = packageList.split(/\s+/u).filter(Boolean);

  assert.ok(nativeDependenciesStep, 'expected the build job to install native dependencies');
  assert.ok(
    nativePackages.includes('libavdevice-dev'),
    'ffmpeg-sys-next enables the avdevice feature, so Linux builds require libavdevice-dev',
  );
  assert.match(nativeDependenciesStep.run, /scripts\/act\/native-build-packages\.txt/u);
  assert.equal(
    nativeDependenciesStep.if,
    "${{ env.ACT != 'true' || env.ACT_NATIVE_DEPS_READY != 'true' }}",
  );
  assert.match(dockerfile, /COPY native-build-packages\.txt/u);
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

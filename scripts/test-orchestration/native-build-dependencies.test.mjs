import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

test('the Linux build job installs every FFmpeg development library required by the engine', async () => {
  const workflow = parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  const nativeDependenciesStep = workflow.jobs.build.steps.find(
    (step) => step.name === 'Install native build dependencies',
  );

  assert.ok(nativeDependenciesStep, 'expected the build job to install native dependencies');
  assert.match(
    nativeDependenciesStep.run,
    /(?:^|\s)libavdevice-dev(?:\s|\\|$)/u,
    'ffmpeg-sys-next enables the avdevice feature, so Linux builds require libavdevice-dev',
  );
});

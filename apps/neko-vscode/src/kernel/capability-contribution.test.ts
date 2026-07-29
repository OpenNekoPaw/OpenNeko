import assert from 'node:assert/strict';
import test from 'node:test';

import { createCapabilityContribution } from './capability-contribution.ts';
import { DisposableStore } from './disposable-store.ts';
import { createLazyCapability } from './lazy-capability.ts';

test('projects lifecycle state and reports unavailable invocations without hiding failure', async () => {
  const projected: string[] = [];
  const diagnostics: string[] = [];
  const owner = new DisposableStore();
  const capability = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: {},
    async start() {
      throw new Error('provider configuration is invalid');
    },
  });
  const contribution = await createCapabilityContribution({
    capability,
    owner,
    availability: {
      project: (state) => {
        projected.push(state.status);
      },
      reportProjectionFailure: (error) => {
        throw new Error('State projection must not fail in this test.', { cause: error });
      },
    },
    reportUnavailable: (diagnostic) => {
      diagnostics.push(`${diagnostic.capabilityId}:${diagnostic.code}`);
    },
  });

  await assert.rejects(
    () => contribution.invoke(() => 'unreachable'),
    /provider configuration is invalid/u,
  );
  await owner.dispose();
  assert.deepEqual(projected, ['idle', 'starting', 'unavailable']);
  assert.deepEqual(diagnostics, ['neko.capability.generation:initialization-failed']);
});

test('keeps independent contributions operational after another capability fails', async () => {
  const owner = new DisposableStore();
  const failed = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: {},
    async start() {
      throw new Error('generation unavailable');
    },
  });
  const preview = createLazyCapability({
    id: 'neko.capability.preview',
    dependencies: {},
    async start() {
      return 'preview';
    },
  });
  const createContribution = <TValue>(capability: typeof preview | typeof failed) =>
    createCapabilityContribution({
      capability,
      owner,
      availability: {
        project() {},
        reportProjectionFailure(error) {
          throw error;
        },
      },
      reportUnavailable() {},
    });
  const failedContribution = await createContribution(failed);
  const previewContribution = await createContribution(preview);

  await assert.rejects(
    () => failedContribution.invoke(() => 'unreachable'),
    /generation unavailable/u,
  );
  assert.equal(await previewContribution.invoke((value) => value), 'preview');
  await owner.dispose();
});

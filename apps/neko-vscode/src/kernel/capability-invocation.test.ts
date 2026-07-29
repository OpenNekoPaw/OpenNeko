import assert from 'node:assert/strict';
import test from 'node:test';

import { invokeCapability } from './capability-invocation.ts';
import { createLazyCapability } from './lazy-capability.ts';

test('reports an explicit causal diagnostic before rejecting an unavailable invocation', async () => {
  const diagnostics: string[] = [];
  const metadata = createLazyCapability({
    id: 'neko.capability.metadata',
    dependencies: {},
    async start() {
      throw new Error('metadata schema is invalid');
    },
  });
  const generation = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: { metadata },
    async start() {
      return 'generation';
    },
  });

  await assert.rejects(
    () =>
      invokeCapability(
        generation,
        () => 'unreachable',
        (diagnostic) => {
          diagnostics.push(
            `${diagnostic.code}:${diagnostic.causalChain.join(' -> ')}:${diagnostic.message}`,
          );
        },
      ),
    /neko\.capability\.metadata failed/u,
  );
  assert.deepEqual(diagnostics, [
    'dependency-unavailable:neko.capability.generation -> neko.capability.metadata:' +
      'Capability neko.capability.generation is unavailable because neko.capability.metadata failed.',
  ]);
});

test('does not report or disturb an independent successful invocation', async () => {
  let reports = 0;
  const preview = createLazyCapability({
    id: 'neko.capability.preview',
    dependencies: {},
    async start() {
      return { status: 'ready' as const };
    },
  });

  const result = await invokeCapability(
    preview,
    ({ status }) => `preview:${status}`,
    () => {
      reports += 1;
    },
  );
  assert.equal(result, 'preview:ready');
  assert.equal(reports, 0);
});

test('does not misclassify an operation failure as capability unavailability', async () => {
  let reports = 0;
  const preview = createLazyCapability({
    id: 'neko.capability.preview',
    dependencies: {},
    async start() {
      return 'ready';
    },
  });

  await assert.rejects(
    () =>
      invokeCapability(
        preview,
        () => {
          throw new Error('preview operation failed');
        },
        () => {
          reports += 1;
        },
      ),
    /preview operation failed/u,
  );
  assert.equal(reports, 0);
  assert.equal(preview.state().status, 'ready');
});

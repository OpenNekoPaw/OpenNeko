import assert from 'node:assert/strict';
import test from 'node:test';

import { HostKernel } from './host-kernel.ts';
import { CapabilityUnavailableError, createLazyCapability } from './lazy-capability.ts';
import { defineFeature, featureRef, type CapabilityId, type LazyCapability } from './types.ts';

test('registers typed dependencies once and disposes in reverse order', async () => {
  const events: string[] = [];
  const toolsRef = featureRef<{ readonly name: 'tools' }>('neko.tools');
  const canvasRef = featureRef<{ readonly name: 'canvas' }>('neko.canvas');
  const tools = defineFeature({
    ref: toolsRef,
    dependencies: {},
    async register({ owner }) {
      events.push('register:tools');
      owner.add({ dispose: () => events.push('dispose:tools') });
      return { exports: { name: 'tools' as const } };
    },
  });
  const canvas = defineFeature({
    ref: canvasRef,
    dependencies: { tools: toolsRef },
    async register({ owner }, { tools: toolsDependency }) {
      assert.equal(toolsDependency.name, 'tools');
      events.push('register:canvas');
      owner.add({ dispose: () => events.push('dispose:canvas') });
      return { exports: { name: 'canvas' as const } };
    },
  });
  const kernel = new HostKernel([canvas, tools]);
  await kernel.registerAll();
  assert.equal(kernel.get(canvasRef).name, 'canvas');
  await kernel.dispose();
  assert.deepEqual(events, [
    'register:tools',
    'register:canvas',
    'dispose:canvas',
    'dispose:tools',
  ]);
});

test('rejects duplicate, missing and cyclic feature plans before side effects', () => {
  const leftRef = featureRef<void>('neko.left');
  const rightRef = featureRef<void>('neko.right');
  const register = async () => ({ exports: undefined });
  assert.throws(
    () =>
      new HostKernel([
        defineFeature({ ref: leftRef, dependencies: {}, register }),
        defineFeature({ ref: leftRef, dependencies: {}, register }),
      ]),
    /Duplicate feature definition/u,
  );
  assert.throws(
    () =>
      new HostKernel([
        defineFeature({ ref: leftRef, dependencies: { right: rightRef }, register }),
      ]),
    /missing dependency neko\.right/u,
  );
  assert.throws(
    () =>
      new HostKernel([
        defineFeature({ ref: leftRef, dependencies: { right: rightRef }, register }),
        defineFeature({ ref: rightRef, dependencies: { left: leftRef }, register }),
      ]),
    /neko\.left -> neko\.right -> neko\.left/u,
  );
});

test('rolls back partial and prior registration resources on failure', async () => {
  const events: string[] = [];
  const toolsRef = featureRef<void>('neko.tools');
  const canvasRef = featureRef<void>('neko.canvas');
  const kernel = new HostKernel([
    defineFeature({
      ref: toolsRef,
      dependencies: {},
      async register({ owner }) {
        owner.add({ dispose: () => events.push('dispose:tools') });
        return { exports: undefined };
      },
    }),
    defineFeature({
      ref: canvasRef,
      dependencies: { tools: toolsRef },
      async register({ owner }) {
        owner.add({ dispose: () => events.push('dispose:canvas-partial') });
        throw new Error('canvas failed');
      },
    }),
  ]);
  await assert.rejects(() => kernel.registerAll(), /canvas failed/u);
  assert.deepEqual(events, ['dispose:canvas-partial', 'dispose:tools']);
});

test('contains lazy capability failure and poisons repeated access', async () => {
  let starts = 0;
  let disposals = 0;
  const capability = createLazyCapability({
    id: 'neko.capability.media',
    dependencies: {},
    async start(owner) {
      starts += 1;
      owner.add({ dispose: () => (disposals += 1) });
      throw new Error('media unavailable');
    },
  });
  await assert.rejects(() => capability.get(), /media unavailable/u);
  await assert.rejects(() => capability.get(), /media unavailable/u);
  assert.equal(starts, 1);
  assert.equal(disposals, 1);
  assert.deepEqual(capability.state(), {
    id: 'neko.capability.media',
    status: 'unavailable',
    diagnostic: {
      capabilityId: 'neko.capability.media',
      code: 'initialization-failed',
      message: 'Capability neko.capability.media failed to initialize: media unavailable',
      causalChain: ['neko.capability.media'],
    },
  });
  await capability.dispose();
});

test('starts typed capability dependencies lazily and exposes state changes', async () => {
  const events: string[] = [];
  const states: string[] = [];
  const metadata = createLazyCapability({
    id: 'neko.capability.metadata',
    dependencies: {},
    async start(owner) {
      events.push('start:metadata');
      owner.add({ dispose: () => events.push('dispose:metadata') });
      return { workspaceId: 'workspace-1' };
    },
  });
  const generation = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: { metadata },
    async start(owner, _signal, { metadata: resolvedMetadata }) {
      assert.equal(resolvedMetadata.workspaceId, 'workspace-1');
      events.push('start:generation');
      owner.add({ dispose: () => events.push('dispose:generation') });
      return { status: 'ready' as const };
    },
  });
  const subscription = generation.onDidChange((state) => states.push(state.status));

  assert.deepEqual(events, []);
  assert.equal(generation.state().status, 'idle');
  assert.equal((await generation.get()).status, 'ready');
  assert.deepEqual(events, ['start:metadata', 'start:generation']);
  assert.deepEqual(states, ['starting', 'ready']);

  subscription.dispose();
  await generation.dispose();
  await metadata.dispose();
  assert.deepEqual(events, [
    'start:metadata',
    'start:generation',
    'dispose:generation',
    'dispose:metadata',
  ]);
});

test('propagates causal unavailability without starting dependents or unrelated capabilities', async () => {
  let dependentStarts = 0;
  let independentStarts = 0;
  const metadata = createLazyCapability({
    id: 'neko.capability.metadata',
    dependencies: {},
    async start() {
      throw new Error('database unavailable');
    },
  });
  const generation = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: { metadata },
    async start() {
      dependentStarts += 1;
      return 'generation';
    },
  });
  const independent = createLazyCapability({
    id: 'neko.capability.preview',
    dependencies: {},
    async start() {
      independentStarts += 1;
      return 'preview';
    },
  });

  await assert.rejects(
    () => generation.get(),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityUnavailableError);
      assert.deepEqual(error.diagnostic, {
        capabilityId: 'neko.capability.generation',
        code: 'dependency-unavailable',
        message:
          'Capability neko.capability.generation is unavailable because neko.capability.metadata failed.',
        causalChain: ['neko.capability.generation', 'neko.capability.metadata'],
      });
      return true;
    },
  );
  assert.equal(dependentStarts, 0);
  assert.equal(await independent.get(), 'preview');
  assert.equal(independentStarts, 1);
});

test('retries only capabilities with an explicit manual retry policy', async () => {
  let starts = 0;
  const manual = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: {},
    retryPolicy: 'manual',
    async start() {
      starts += 1;
      if (starts === 1) throw new Error('temporary provider failure');
      return 'ready';
    },
  });
  await assert.rejects(() => manual.get(), /temporary provider failure/u);
  assert.equal(await manual.retry(), 'ready');
  assert.equal(starts, 2);

  const poisoned = createLazyCapability({
    id: 'neko.capability.metadata',
    dependencies: {},
    async start() {
      throw new Error('invalid database');
    },
  });
  await assert.rejects(() => poisoned.get(), /invalid database/u);
  await assert.rejects(
    () => poisoned.retry(),
    /does not support retry after initialization failure/u,
  );
});

test('rejects an already-cancelled request without starting the capability', async () => {
  let starts = 0;
  const capability = createLazyCapability({
    id: 'neko.capability.media',
    dependencies: {},
    async start() {
      starts += 1;
      return 'ready';
    },
  });
  const controller = new AbortController();
  controller.abort(new Error('feature disposed'));

  await assert.rejects(() => capability.get(controller.signal), /feature disposed/u);
  assert.equal(starts, 0);
  assert.equal(capability.state().status, 'idle');
});

test('rejects duplicate, missing and cyclic capability plans before side effects', () => {
  const left = capabilityStub('neko.capability.left', ['neko.capability.right']);
  const right = capabilityStub('neko.capability.right', ['neko.capability.left']);
  const missing = capabilityStub('neko.capability.missing-owner', ['neko.capability.not-defined']);

  assert.throws(
    () => new HostKernel([], { capabilities: [left, left] }),
    /Duplicate capability definition: neko\.capability\.left/u,
  );
  assert.throws(
    () => new HostKernel([], { capabilities: [missing] }),
    /requires missing dependency neko\.capability\.not-defined/u,
  );
  assert.throws(
    () => new HostKernel([], { capabilities: [left, right] }),
    /neko\.capability\.left -> neko\.capability\.right -> neko\.capability\.left/u,
  );
});

test('cancels an in-flight initialization and rolls back partial resources', async () => {
  let disposals = 0;
  let startedResolve: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  const capability = createLazyCapability({
    id: 'neko.capability.media',
    dependencies: {},
    async start(owner, signal) {
      owner.add({ dispose: () => (disposals += 1) });
      startedResolve?.();
      await abortPromise(signal);
      signal.throwIfAborted();
      return 'unreachable';
    },
  });
  const controller = new AbortController();
  const result = capability.get(controller.signal);
  await started;
  controller.abort(new Error('request cancelled'));

  await assert.rejects(
    () => result,
    (error: unknown) => {
      assert.ok(error instanceof CapabilityUnavailableError);
      assert.equal(error.diagnostic.code, 'initialization-cancelled');
      assert.match(error.diagnostic.message, /request cancelled/u);
      return true;
    },
  );
  assert.equal(disposals, 1);
  assert.equal(capability.state().status, 'unavailable');
});

test('disposing during initialization aborts work and releases partial resources once', async () => {
  let disposals = 0;
  let startedResolve: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    startedResolve = resolve;
  });
  const capability = createLazyCapability({
    id: 'neko.capability.media',
    dependencies: {},
    async start(owner, signal) {
      owner.add({ dispose: () => (disposals += 1) });
      startedResolve?.();
      await abortPromise(signal);
      signal.throwIfAborted();
      return 'unreachable';
    },
  });
  const result = capability.get();
  await started;
  await capability.dispose();

  await assert.rejects(() => result, /is disposing/u);
  assert.equal(disposals, 1);
  assert.equal(capability.state().status, 'disposed');
  await capability.dispose();
  assert.equal(disposals, 1);
});

test('Host Kernel disposes registered features before capabilities in reverse order', async () => {
  const events: string[] = [];
  const metadata = createLazyCapability({
    id: 'neko.capability.metadata',
    dependencies: {},
    async start(owner) {
      owner.add({ dispose: () => events.push('dispose:metadata') });
      return 'metadata';
    },
  });
  const generation = createLazyCapability({
    id: 'neko.capability.generation',
    dependencies: { metadata },
    async start(owner) {
      owner.add({ dispose: () => events.push('dispose:generation') });
      return 'generation';
    },
  });
  const feature = featureRef<void>('neko.agent');
  const kernel = new HostKernel(
    [
      defineFeature({
        ref: feature,
        dependencies: {},
        async register({ owner }) {
          owner.add({ dispose: () => events.push('dispose:agent') });
          return { exports: undefined };
        },
      }),
    ],
    { capabilities: [metadata, generation] },
  );
  await kernel.registerAll();
  await generation.get();
  await kernel.dispose();
  assert.deepEqual(events, ['dispose:agent', 'dispose:generation', 'dispose:metadata']);
});

function capabilityStub(
  id: CapabilityId,
  dependencies: readonly CapabilityId[],
): LazyCapability<never> {
  return {
    id,
    dependencies,
    state: () => ({ id, status: 'idle' }),
    onDidChange: () => ({ dispose() {} }),
    get: async () => {
      throw new Error(`Capability stub ${id} must not start.`);
    },
    retry: async () => {
      throw new Error(`Capability stub ${id} must not retry.`);
    },
    async dispose() {},
  };
}

function abortPromise(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

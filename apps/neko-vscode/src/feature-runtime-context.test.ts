import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFeatureRuntimeChildScope,
  createFeatureRuntimeScope,
} from './feature-runtime-context.ts';

test('projects only feature-owned resources, state, storage, and disposal', async () => {
  const disposed: string[] = [];
  const workspaceState = createMemento();
  const baseContext = Object.freeze({
    workspaceState,
    globalStorageUri: uri('/global/suite'),
    extensionMode: 1,
  });
  const controller = new AbortController();
  const scope = createFeatureRuntimeScope(baseContext, {
    stateNamespaceId: 'neko.neko-preview',
    resourceUri: uri('/suite/dist/features/neko-preview'),
    signal: controller.signal,
    joinPath,
  });

  assert.deepEqual(Object.keys(scope.context).sort(), [
    'extensionMode',
    'globalStorageUri',
    'resourceUri',
    'signal',
    'subscriptions',
    'workspaceState',
  ]);
  assert.equal(scope.context.signal, controller.signal);
  assert.equal(scope.context.signal.aborted, false);
  assert.equal(scope.context.resourceUri.fsPath, '/suite/dist/features/neko-preview');
  assert.equal(scope.context.globalStorageUri.fsPath, '/global/suite/features/neko.neko-preview');
  await scope.context.workspaceState.update('view', 'model');
  assert.equal(workspaceState.values.get('neko.neko-preview:view'), 'model');

  scope.context.subscriptions.push({ dispose: () => disposed.push('first') });
  scope.context.subscriptions.push({ dispose: () => disposed.push('second') });
  controller.abort();
  assert.equal(scope.context.signal.aborted, true);
  scope.dispose();
  assert.deepEqual(disposed, ['second', 'first']);
});

test('child scope reuses the feature identity projection with independent ownership', () => {
  const parentController = new AbortController();
  const childController = new AbortController();
  const disposed: string[] = [];
  const parent = {
    signal: parentController.signal,
    subscriptions: [{ dispose: () => disposed.push('parent') }],
    workspaceState: createMemento(),
    globalStorageUri: uri('/global/feature'),
    resourceUri: uri('/suite/dist/features/neko-agent'),
    extensionMode: 1,
  };

  const child = createFeatureRuntimeChildScope(parent, childController.signal);
  child.context.subscriptions.push({ dispose: () => disposed.push('child') });

  assert.equal(child.context.signal, childController.signal);
  assert.equal(child.context.workspaceState, parent.workspaceState);
  assert.equal(child.context.globalStorageUri, parent.globalStorageUri);
  assert.notEqual(child.context.subscriptions, parent.subscriptions);

  child.dispose();
  assert.deepEqual(disposed, ['child']);
  assert.equal(parent.subscriptions.length, 1);
});

function createMemento() {
  const values = new Map<string, unknown>();
  return {
    values,
    keys: () => [...values.keys()],
    get: (key: string, defaultValue?: unknown) =>
      values.has(key) ? values.get(key) : defaultValue,
    update: async (key: string, value: unknown) => {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    },
    setKeysForSync: () => {},
  };
}

function uri(fsPath: string) {
  return { fsPath };
}

function joinPath(base: { fsPath: string }, ...segments: string[]) {
  return uri([base.fsPath.replace(/\/$/u, ''), ...segments].join('/'));
}

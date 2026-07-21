import assert from 'node:assert/strict';
import test from 'node:test';

import { createScopedExtensionContext } from './scoped-extension-context.ts';

test('scopes feature resources, state, secrets, and disposal', async () => {
  const disposed: string[] = [];
  const workspaceState = createMemento();
  const globalState = createMemento();
  const secrets = createSecrets();
  const baseContext = {
    subscriptions: [],
    extensionUri: uri('/suite'),
    extensionPath: '/suite',
    globalStorageUri: uri('/global/suite'),
    storageUri: uri('/workspace/suite'),
    logUri: uri('/logs/suite'),
    workspaceState,
    globalState,
    secrets,
  };
  Object.freeze(baseContext);
  const scoped = createScopedExtensionContext(baseContext, {
    featureId: 'neko.neko-preview',
    featureUri: uri('/suite/dist/features/neko-preview'),
    joinPath,
  });

  assert.equal(scoped.context.extensionPath, '/suite/dist/features/neko-preview');
  assert.equal(
    scoped.context.asAbsolutePath('dist/webview/index.html'),
    '/suite/dist/features/neko-preview/dist/webview/index.html',
  );
  assert.equal(scoped.context.globalStorageUri.fsPath, '/global/suite/features/neko.neko-preview');
  await scoped.context.workspaceState.update('view', 'model');
  await scoped.context.secrets.store('token', 'secret');
  assert.equal(workspaceState.values.get('neko.neko-preview:view'), 'model');
  assert.equal(secrets.values.get('neko.neko-preview:token'), 'secret');

  scoped.context.subscriptions.push({ dispose: () => disposed.push('first') });
  scoped.context.subscriptions.push({ dispose: () => disposed.push('second') });
  scoped.dispose();
  assert.deepEqual(disposed, ['second', 'first']);
});

function createMemento() {
  const values = new Map();
  return {
    values,
    keys: () => [...values.keys()],
    get: (key, defaultValue) => (values.has(key) ? values.get(key) : defaultValue),
    update: async (key, value) => {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    },
    setKeysForSync: () => {},
  };
}

function createSecrets() {
  const values = new Map();
  return {
    values,
    onDidChange: () => ({ dispose() {} }),
    get: async (key) => values.get(key),
    store: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
    keys: async () => [...values.keys()],
  };
}

function uri(fsPath) {
  return { fsPath };
}

function joinPath(base, ...segments) {
  return uri([base.fsPath.replace(/\/$/u, ''), ...segments].join('/'));
}

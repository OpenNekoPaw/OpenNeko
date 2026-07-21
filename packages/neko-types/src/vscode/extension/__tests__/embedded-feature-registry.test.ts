import { afterEach, describe, expect, it } from 'vitest';

import {
  EmbeddedFeatureRegistry,
  installEmbeddedFeatureRegistry,
  requireNekoExtension,
  resolveNekoExtension,
} from '../embedded-feature-registry';

afterEach(() => {
  globalThis.__openNekoEmbeddedFeatureRegistry = undefined;
});

describe('EmbeddedFeatureRegistry', () => {
  it('activates a registered feature at most once', async () => {
    const registry = new EmbeddedFeatureRegistry();
    let activations = 0;
    registry.register({
      id: 'neko.neko-engine',
      extensionUri: uri('/features/neko-engine'),
      packageJSON: { name: 'neko-engine' },
      activate: () => ({ activation: ++activations }),
    });

    const extension = registry.requireExtension('neko.neko-engine');
    expect(extension.isActive).toBe(false);
    expect(await extension.activate()).toEqual({ activation: 1 });
    expect(await extension.activate()).toEqual({ activation: 1 });
    expect(extension.exports).toEqual({ activation: 1 });
  });

  it('resolves activation waiters only after the feature is active', async () => {
    const registry = new EmbeddedFeatureRegistry();
    registry.register({
      id: 'neko.neko-agent',
      extensionUri: uri('/features/neko-agent'),
      packageJSON: { name: 'neko-agent' },
      activate: () => ({ id: 'agent-api' }),
    });

    let settled = false;
    const waiter = registry.waitUntilActive('neko.neko-agent').then((extension) => {
      settled = true;
      return extension;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await registry.activateAll(['neko.neko-agent']);
    const extension = await waiter;
    expect(extension.isActive).toBe(true);
    expect(extension.exports).toEqual({ id: 'agent-api' });
  });

  it('activates features in the requested dependency order', async () => {
    const registry = new EmbeddedFeatureRegistry();
    const activationOrder: string[] = [];
    for (const id of ['neko.neko-engine', 'neko.neko-tools', 'neko.neko-agent']) {
      registry.register({
        id,
        extensionUri: uri(`/features/${id}`),
        packageJSON: {},
        activate: () => {
          activationOrder.push(id);
        },
      });
    }

    await registry.activateAll(['neko.neko-engine', 'neko.neko-tools', 'neko.neko-agent']);
    expect(activationOrder).toEqual(['neko.neko-engine', 'neko.neko-tools', 'neko.neko-agent']);
  });

  it('fails visibly for duplicate, missing, and cyclic registrations', async () => {
    const registry = new EmbeddedFeatureRegistry();
    const registration = {
      id: 'neko.neko-engine',
      extensionUri: uri('/features/neko-engine'),
      packageJSON: {},
      activate: () => ({}),
    };
    registry.register(registration);
    expect(() => registry.register(registration)).toThrow(/already registered/u);
    expect(() => registry.requireExtension('neko.missing')).toThrow(/not registered/u);

    registry.register({
      id: 'neko.neko-agent',
      extensionUri: uri('/features/neko-agent'),
      packageJSON: {},
      activate: async () => registry.requireExtension('neko.neko-canvas').activate(),
    });
    registry.register({
      id: 'neko.neko-canvas',
      extensionUri: uri('/features/neko-canvas'),
      packageJSON: {},
      activate: async () => registry.requireExtension('neko.neko-agent').activate(),
    });
    await expect(registry.requireExtension('neko.neko-agent').activate()).rejects.toThrow(
      /neko\.neko-agent -> neko\.neko-canvas -> neko\.neko-agent/u,
    );
  });

  it('uses the embedded registry exclusively once installed', () => {
    const registry = new EmbeddedFeatureRegistry();
    const owner = installEmbeddedFeatureRegistry(registry);
    let legacyCalls = 0;
    expect(() =>
      resolveNekoExtension('neko.missing', () => {
        legacyCalls += 1;
        return undefined;
      }),
    ).toThrow(/not registered/u);
    expect(legacyCalls).toBe(0);
    expect(() => requireNekoExtension('neko.missing')).toThrow(/not registered/u);
    resolveNekoExtension('vscode.git', () => {
      legacyCalls += 1;
      return undefined;
    });
    expect(legacyCalls).toBe(1);
    owner.dispose();
  });
});

function uri(fsPath: string) {
  return {
    fsPath,
    scheme: 'file',
    authority: '',
    path: fsPath,
    query: '',
    fragment: '',
    with: () => uri(fsPath),
    toJSON: () => ({ scheme: 'file', path: fsPath }),
    toString: () => `file://${fsPath}`,
  };
}

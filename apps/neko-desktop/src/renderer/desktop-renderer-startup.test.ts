import { describe, expect, it, vi } from 'vitest';
import type { DesktopApplicationSettingsProjection } from '../shared/application-settings-contract';
import type { DesktopBootstrapProjection } from '../shared/bridge-contract';
import { initializeDesktopRendererBridge } from './desktop-renderer-startup';

describe('Desktop renderer startup', () => {
  it('waits for bootstrap, settings, and the Agent module before exposing settings to React', async () => {
    const started: string[] = [];
    const bootstrap = deferred<DesktopBootstrapProjection>();
    const settings = deferred<DesktopApplicationSettingsProjection>();
    const agentModule = deferred<unknown>();
    const result = initializeDesktopRendererBridge(
      {
        bootstrap: {
          get: vi.fn(() => {
            started.push('bootstrap');
            return bootstrap.promise;
          }),
        },
        settings: {
          get: vi.fn(() => {
            started.push('settings');
            return settings.promise;
          }),
        },
      },
      {
        preloadAgentModule: vi.fn(() => {
          started.push('agent-module');
          return agentModule.promise;
        }),
      },
    );
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    expect(started).toEqual(['bootstrap', 'settings', 'agent-module']);

    settings.resolve(createSettings());
    bootstrap.resolve(createBootstrap());
    await Promise.resolve();
    expect(settled).toBe(false);

    agentModule.resolve({});
    await expect(result).resolves.toEqual(createSettings());
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let fulfill: ((value: T) => void) | undefined;
  const promise = new Promise<T>((settle) => {
    fulfill = settle;
  });
  return {
    promise,
    resolve(value) {
      if (!fulfill) throw new Error('Deferred promise resolver was not initialized.');
      fulfill(value);
    },
  };
}

function createBootstrap(): DesktopBootstrapProjection {
  return {
    schemaVersion: 1,
    requestId: 'bootstrap-1',
    application: {
      schemaVersion: 1,
      applicationId: 'neko-desktop',
      instanceId: 'application-1',
      version: '0.0.1',
    },
    window: {
      windowId: 'window-1',
      rendererEpoch: 1,
    },
    host: {
      id: 'electron',
      kind: 'electron',
      ui: 'graphical',
    },
    runtime: {
      platform: 'darwin',
    },
    status: 'foundation-ready',
  };
}

function createSettings(): DesktopApplicationSettingsProjection {
  return {
    schemaVersion: 2,
    revision: 0,
    eventSequence: 0,
    preferences: {
      theme: 'light',
      locale: 'system',
      startupTarget: 'home',
      resourceBrowserView: 'list',
    },
  };
}

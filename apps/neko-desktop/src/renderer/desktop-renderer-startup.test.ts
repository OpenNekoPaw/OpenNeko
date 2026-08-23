import { describe, expect, it, vi } from 'vitest';
import type { DesktopApplicationSettingsProjection } from '@neko/host/application-settings';
import type { DesktopBootstrapProjection } from '../shared/bridge-contract';
import { initializeDesktopRendererBridge } from './desktop-renderer-startup';

describe('Desktop renderer startup', () => {
  it('waits for bootstrap and settings before exposing settings to React', async () => {
    const started: string[] = [];
    const bootstrap = deferred<DesktopBootstrapProjection>();
    const settings = deferred<DesktopApplicationSettingsProjection>();
    const result = initializeDesktopRendererBridge({
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
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    expect(started).toEqual(['bootstrap', 'settings']);

    settings.resolve(createSettings());
    await Promise.resolve();
    expect(settled).toBe(false);

    bootstrap.resolve(createBootstrap());
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
    requestId: 'bootstrap-1',
    application: {
      applicationId: 'neko-desktop',
      instanceId: 'application-1',
    },
    window: {
      windowId: 'window-1',
      rendererSessionId: 'renderer-session-1',
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
    eventSequence: 0,
    preferences: {
      theme: 'light',
      locale: 'system',
      resourceBrowserView: 'list',
      fontSize: 'default',
      defaultWorkspaceLocator: '${HOME}/OpenNeko',
    },
  };
}

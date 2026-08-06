import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
  createAgentExtensionManagementHostRequest,
} from '@neko/agent-contracts/extension-management-host';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: vi.fn(),
  },
}));

await import('./index');

const identity = {
  extensionManagementSessionId: 'extension-management:window-1:1',
  windowId: 'window-1',
};

describe('Desktop Extension Management preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        application: {
          applicationId: 'neko-desktop',
          instanceId: 'application-1',
        },
        window: { windowId: 'window-1', rendererSessionId: 'renderer-session-1' },
        host: { id: 'electron', kind: 'electron', ui: 'graphical' },
        runtime: { platform: 'darwin' },
        status: 'foundation-ready',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.bootstrap.get();
    electron.invoke.mockReset();
  });

  afterEach(() => {
    for (const [channel, request] of electron.invoke.mock.calls) {
      if (channel !== AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL) continue;
      expect(request).toMatchObject({ identity });
      expect(request).not.toHaveProperty('path');
      expect(request).not.toHaveProperty('args');
    }
  });

  it('routes the exact owner-qualified request through the canonical Agent channel', async () => {
    const request = createAgentExtensionManagementHostRequest({
      route: 'snapshot.get',
      requestId: 'extensions-1',
      identity,
    });
    electron.invoke.mockImplementation(async (channel: string) => {
      expect(channel).toBe(AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        route: request.route,
        projection: {
          identity,
          skills: [],
          skillDiscovery: { diagnostics: [], duplicateCount: 0 },
          extensions: [],
          extensionDiscovery: { diagnostics: [] },
        },
      };
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.extensionManagement.execute(request)).resolves.toMatchObject({
      projection: { identity },
    });
    expect(electron.invoke).toHaveBeenCalledWith(AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL, request);
    expect('home' in bridge).toBe(false);
  });

  it('rejects stale result identity and unknown projection fields', async () => {
    const request = createAgentExtensionManagementHostRequest({
      route: 'plugin.install',
      requestId: 'extensions-install-1',
      identity,
      pluginId: 'computer-use@openneko',
    });
    electron.invoke.mockResolvedValue({
      requestId: 'stale-request',
      route: request.route,
      projection: {
        identity,
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [],
        extensionDiscovery: { diagnostics: [] },
      },
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.extensionManagement.execute(request)).rejects.toThrow('identity is stale');
  });
});

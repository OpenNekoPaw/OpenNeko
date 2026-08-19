import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL,
  createAgentExtensionManagementHostRequest,
} from '@neko/agent-contracts/extension-management-host';
import {
  AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL,
  parseAutomationLocalRuntimeManagementHostRequest,
} from '@neko/automation-contracts/local-runtime-management';
import {
  AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
  parseAutomationPermissionManagementHostRequest,
} from '@neko/automation-contracts/permission-management';
import { DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS } from '../shared/automation-target-selection-contract';
import { DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS } from '../shared/automation-session-control-contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
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
    removeListener: electron.removeListener,
  },
}));

await import('./index');

const identity = {
  windowId: 'window-1',
};

describe('Desktop Extension Management preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.on.mockClear();
    electron.removeListener.mockClear();
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
      route: 'plugin.enable',
      requestId: 'extensions-enable-1',
      identity,
      pluginId: 'computer-use',
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

  it('routes an opaque personal Skill host action without a physical path', async () => {
    const request = createAgentExtensionManagementHostRequest({
      route: 'skill.open',
      requestId: 'skill-open-1',
      identity,
      managementId: `skill:${'a'.repeat(64)}`,
    });
    electron.invoke.mockResolvedValue({
      requestId: request.requestId,
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

    await expect(bridge.extensionManagement.execute(request)).resolves.toMatchObject({
      route: 'skill.open',
    });
    expect(electron.invoke).toHaveBeenCalledWith(AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL, request);
    expect(JSON.stringify(request)).not.toContain('/Users');
  });

  it('routes only opaque local runtime authorization through its dedicated typed channel', async () => {
    const request = parseAutomationLocalRuntimeManagementHostRequest({
      route: 'asset.authorize',
      requestId: 'local-runtime-authorize-1',
      identity,
      sourceId: 'browser-use.observe.local',
      assetKey: 'provider-runtime',
    });
    electron.invoke.mockImplementation(async (channel: string, payload: unknown) => {
      expect(channel).toBe(AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL);
      expect(JSON.stringify(payload)).not.toContain('/Users');
      return {
        requestId: request.requestId,
        route: request.route,
        projection: { identity, runtimes: [] },
      };
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.automationLocalRuntimes.execute(request)).resolves.toMatchObject({
      projection: { identity, runtimes: [] },
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      AUTOMATION_LOCAL_RUNTIME_MANAGEMENT_HOST_CHANNEL,
      request,
    );
  });

  it('routes only an explicit OS permission request through its dedicated typed channel', async () => {
    const request = parseAutomationPermissionManagementHostRequest({
      route: 'permission.request',
      requestId: 'permission-request-1',
      identity,
      permission: 'screen-recording',
    });
    electron.invoke.mockImplementation(async (channel: string) => {
      expect(channel).toBe(AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL);
      return {
        requestId: request.requestId,
        route: request.route,
        projection: { identity, permissions: [] },
      };
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.automationPermissions.execute(request)).resolves.toMatchObject({
      projection: { identity, permissions: [] },
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL,
      request,
    );
  });

  it('routes exact Conversation target selection and exposes only a generic changed event', async () => {
    const request = {
      requestId: 'target-selection-1',
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        viewId: 'view-1',
        connectionId: 'connection-1',
      },
      conversationId: 'conversation-1',
      route: 'pending.list' as const,
    };
    electron.invoke.mockImplementation(async (channel: string) => {
      expect(channel).toBe(DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.execute);
      return { requestId: request.requestId, route: request.route, pending: [] };
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.automationTargetSelection.execute(request)).resolves.toEqual({
      requestId: request.requestId,
      route: request.route,
      pending: [],
    });
    const listener = vi.fn();
    const unsubscribe = bridge.automationTargetSelection.subscribe(listener);
    const registration = electron.on.mock.calls.find(
      ([channel]) => channel === DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.changed,
    );
    const handler = registration?.[1] as
      ((event: Electron.IpcRendererEvent, value: unknown) => void) | undefined;
    if (!handler) throw new Error('Target selection changed listener was not registered.');
    handler({} as Electron.IpcRendererEvent, { kind: 'changed' });
    expect(listener).toHaveBeenCalledOnce();
    expect(() =>
      handler({} as Electron.IpcRendererEvent, {
        kind: 'changed',
        targetKey: 'must-not-cross-generic-event',
      }),
    ).toThrow('unsupported or missing fields');
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledWith(
      DESKTOP_AUTOMATION_TARGET_SELECTION_CHANNELS.changed,
      handler,
    );
  });

  it('routes exact Conversation session control and keeps changed events data-free', async () => {
    const request = {
      requestId: 'session-control-1',
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        viewId: 'view-1',
        connectionId: 'connection-1',
      },
      conversationId: 'conversation-1',
      route: 'session.control' as const,
      command: {
        sessionId: 'session-1',
        owner: {
          conversationId: 'conversation-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
        },
        action: 'take-over' as const,
      },
    };
    electron.invoke.mockImplementation(async (channel: string) => {
      expect(channel).toBe(DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.execute);
      return { requestId: request.requestId, route: request.route, controls: [] };
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.automationSessionControl.execute(request)).resolves.toEqual({
      requestId: request.requestId,
      route: request.route,
      controls: [],
    });
    const listener = vi.fn();
    const unsubscribe = bridge.automationSessionControl.subscribe(listener);
    const registration = electron.on.mock.calls.find(
      ([channel]) => channel === DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.changed,
    );
    const handler = registration?.[1] as
      ((event: Electron.IpcRendererEvent, value: unknown) => void) | undefined;
    if (!handler) throw new Error('Session control changed listener was not registered.');
    handler({} as Electron.IpcRendererEvent, { kind: 'changed' });
    expect(listener).toHaveBeenCalledOnce();
    expect(() =>
      handler({} as Electron.IpcRendererEvent, {
        kind: 'changed',
        sessionId: 'must-not-cross-generic-event',
      }),
    ).toThrow('unsupported or missing fields');
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledWith(
      DESKTOP_AUTOMATION_SESSION_CONTROL_CHANNELS.changed,
      handler,
    );
  });
});

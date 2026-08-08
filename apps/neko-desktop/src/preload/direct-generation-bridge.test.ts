import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_DIRECT_GENERATION_CHANNEL } from '../shared/generation-contract';

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

describe('Desktop Direct Generation preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        application: { applicationId: 'neko-desktop', instanceId: 'application-1' },
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

  it('submits an exact Draft scope and typed operation over the canonical channel', async () => {
    const scope = {
      kind: 'agent-draft' as const,
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        viewId: 'view-1',
        draftId: 'draft-1',
        connectionId: 'launch-connection-1',
      },
    };
    const operation = {
      mediaKind: 'image' as const,
      prompt: 'Generate an image',
      providerId: 'image-provider',
      modelId: 'image-model',
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
    };
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(DESKTOP_DIRECT_GENERATION_CHANNEL);
        expect(request).toEqual({
          requestId: expect.stringMatching(/^desktop-direct-generation-/u),
          scope,
          operation,
        });
        return {
          requestId: request.requestId,
          projection: createProjection(),
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.directGeneration.submit(scope, operation)).resolves.toEqual(
      createProjection(),
    );
  });

  it('rejects a response for another request identity', async () => {
    electron.invoke.mockResolvedValue({
      requestId: 'desktop-direct-generation:stale',
      projection: createProjection(),
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.directGeneration.submit(
        {
          kind: 'agent-session',
          connection: {
            applicationInstanceId: 'application-1',
            windowId: 'window-1',
            workbenchInstanceId: 'workbench-1',
            agentSurfaceId: 'surface-1',
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            viewId: 'view-1',
            connectionId: 'session-connection-1',
          },
        },
        {
          mediaKind: 'image',
          prompt: 'Generate an image',
          providerId: 'image-provider',
          modelId: 'image-model',
        },
      ),
    ).rejects.toThrow('does not match request');
  });
});

function createProjection() {
  return {
    jobId: 'job-image',
    mediaKind: 'image' as const,
    purpose: 'image.generate' as const,
    providerId: 'image-provider',
    modelId: 'image-model',
    phase: 'succeeded' as const,
    resultLocators: [
      {
        kind: 'generated-output' as const,
        outputId: 'output-image',
        digest: 'sha256:image',
        path: 'generated/image/output.png',
      },
    ],
  };
}

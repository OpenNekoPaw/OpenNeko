import { describe, expect, it, vi } from 'vitest';

import type { AutomationMcpClientPort } from '@neko/automation-node';

import type { DesktopAutomationLocalRuntimeHost } from './desktop-automation-local-runtime-host';
import type { DesktopCuaDriverMcpClientFactory } from './desktop-cua-driver-mcp-client-factory';
import { createDesktopAutomationPluginToolAdapter } from './desktop-automation-plugin-tool-adapter';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('Desktop Automation plugin Tool adapter', () => {
  it('projects one ready Cua runtime into the canonical product Tool contribution', async () => {
    const inspectionClient = client({
      tools: [
        {
          name: 'verify_state',
          inputSchema: {
            type: 'object',
            properties: { pid: {}, window_id: {}, session: {} },
          },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
      ],
    });
    const createCuaClients = vi.fn((): DesktopCuaDriverMcpClientFactory => ({
      createInspectionClient: () => inspectionClient,
      createSessionClient: () =>
        client({
          tools: [],
          callTool: async () => ({
            content: [
              { type: 'text', text: 'Window is visible.' },
              { type: 'image', data: PNG_BASE64, mimeType: 'image/png' },
            ],
          }),
        }),
      createTargetDiscoveryClient: () => discoveryClient(),
      inspectProvider: async () => ({
        server: { name: 'cua-driver', version: 'fixture' },
        tools: [],
      }),
    }));
    const adapter = createDesktopAutomationPluginToolAdapter({
      localRuntimes: localRuntimeHost(),
      targetSelections: {
        select: async (projection) => ({
          authorizationId: projection.authorizationId,
          targetKey: projection.candidates[0]?.targetKey,
        }),
        listPending: () => [],
        resolve: () => undefined,
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      hostPermissions: { query: async () => 'granted' },
      storageRoot: '/tmp/openneko-automation-fixture',
      platform: 'darwin',
      createCuaClients,
    });

    const contribution = await adapter.build({
      pluginId: 'computer-use@openneko',
      pluginRoot: '/fixture/computer-use',
      mcpServerIds: ['computer-use'],
      appIds: [],
      mcpToolExposure: 'adapter-only',
    });

    expect(contribution?.tools.map((tool) => tool.name)).toEqual([
      'automation_cua-driver_verify_state',
    ]);
    expect(contribution?.readiness).toEqual({ status: 'ready', diagnosticCode: '' });
    expect(contribution?.sourceFingerprint).toBe(
      'computer-use.observe.local:local-runtime:cua-fixture',
    );
    expect(createCuaClients).toHaveBeenCalledWith({
      appBundlePath: '/Applications/CuaDriver.app',
      executablePath: '/Applications/CuaDriver.app/Contents/MacOS/cua-driver',
      storageRoot: '/tmp/openneko-automation-fixture/cua-driver',
      platform: 'darwin',
    });
    expect(adapter.listOwnedSessions('computer-use@openneko')).toEqual([]);

    const toolResult = await contribution?.tools[0]?.execute(
      { arguments: { include_screenshot: true }, timeoutMs: 30_000, stepBudget: 1 },
      {
        metadata: {
          workspaceId: 'workspace-1',
          conversationId: 'conversation-1',
          runId: 'run-1',
          toolCallId: 'tool-call-1',
        },
      },
    );
    expect(toolResult).toMatchObject({
      success: true,
      attachments: [
        {
          type: 'image',
          transientImage: {
            receiptId: expect.any(String),
            sessionId: expect.any(String),
            actionId: expect.any(String),
          },
        },
      ],
    });
    const transientImage = toolResult?.attachments?.[0]?.transientImage;
    if (!transientImage) throw new Error('Expected a transient image receipt.');
    const consumed = adapter.consumeTransientImage(transientImage);
    expect(Buffer.from(consumed.bytes).toString('base64')).toBe(PNG_BASE64);
    expect(consumed.mimeType).toBe('image/png');
    expect(() => adapter.consumeTransientImage(transientImage)).toThrow('unavailable or expired');

    await contribution?.dispose();
    await adapter.dispose();
    expect(inspectionClient.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps Browser Use unavailable until its upstream MCP can bind an exact selected tab', async () => {
    const adapter = createDesktopAutomationPluginToolAdapter({
      localRuntimes: localRuntimeHost(),
      targetSelections: {
        select: async () => undefined,
        listPending: () => [],
        resolve: () => undefined,
        subscribe: () => () => undefined,
        dispose: () => undefined,
      },
      hostPermissions: { query: async () => 'granted' },
      storageRoot: '/tmp/openneko-automation-fixture',
      platform: 'darwin',
    });

    await expect(
      adapter.build({
        pluginId: 'browser-use@openneko',
        pluginRoot: '/fixture/browser-use',
        mcpServerIds: ['browser-use'],
        appIds: [],
        mcpToolExposure: 'adapter-only',
      }),
    ).resolves.toBeUndefined();
    await adapter.dispose();
  });
});

function localRuntimeHost(): DesktopAutomationLocalRuntimeHost {
  const runtimes = [
    {
      sourceId: 'computer-use.observe.local',
      displayName: 'Cua Driver',
      providerKind: 'computer' as const,
      installationGuideUrl: 'https://cua.ai/docs',
      installationCommand: 'install-cua',
      authorized: true,
      runtimeId: 'local-runtime:cua-fixture',
      state: 'ready' as const,
      assets: [
        {
          key: 'provider-runtime' as const,
          label: 'CuaDriver.app',
          authorized: true,
          runtimeId: 'local-runtime-asset:cua-fixture',
          displayName: 'CuaDriver.app',
          status: 'valid' as const,
        },
      ],
      diagnostics: [],
    },
  ];
  return {
    management: {
      list: async () => runtimes,
      openInstallationGuide: async () => runtimes,
      copyInstallationCommand: async () => runtimes,
      authorizeAsset: async () => runtimes,
      recheck: async () => runtimes,
      disconnect: async () => [],
    },
    resolve: async () => ({
      sourceId: 'computer-use.observe.local',
      runtimeId: 'local-runtime:cua-fixture',
      assets: { 'provider-runtime': '/Applications/CuaDriver.app' },
    }),
    dispose: () => undefined,
  };
}

function client(input: {
  readonly tools: Awaited<ReturnType<AutomationMcpClientPort['listTools']>>;
  readonly callTool?: AutomationMcpClientPort['callTool'];
}): AutomationMcpClientPort {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    listTools: vi.fn(async () => input.tools),
    callTool: vi.fn(input.callTool ?? (async () => ({ content: [] }))),
  };
}

function discoveryClient(): AutomationMcpClientPort {
  return client({
    tools: [
      {
        name: 'list_apps',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: 'list_windows',
        inputSchema: {
          type: 'object',
          properties: { pid: {}, on_screen_only: {} },
        },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
    ],
    async callTool(input) {
      if (input.name === 'list_apps') {
        return {
          content: [{ type: 'text', text: 'Found apps.' }],
          structuredContent: {
            apps: [
              {
                pid: 42,
                name: 'Editor',
                bundle_id: 'com.example.Editor',
                active: true,
                running: true,
                launch_path: '/Applications/Editor.app',
                kind: 'desktop',
                last_used: null,
                windows: [],
              },
            ],
          },
        };
      }
      if (input.name === 'list_windows') {
        return {
          content: [{ type: 'text', text: 'Found windows.' }],
          structuredContent: {
            windows: [
              {
                window_id: 701,
                pid: 42,
                app_name: 'Editor',
                title: 'Project.neko',
                bounds: { x: 10, y: 20, width: 800, height: 600 },
                layer: 0,
                z_index: 1,
                is_on_screen: true,
                current_space_id: 1,
                on_current_space: true,
                space_ids: [1],
              },
            ],
            current_space_id: 1,
          },
        };
      }
      throw new Error(`Unexpected discovery Tool '${input.name}'.`);
    },
  });
}

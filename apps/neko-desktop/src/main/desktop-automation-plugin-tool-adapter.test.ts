import { describe, expect, it, vi } from 'vitest';

import type { AutomationMcpClientPort } from '@neko/automation-node';

import type { DesktopAutomationLocalRuntimeHost } from './desktop-automation-local-runtime-host';
import type { DesktopBrowserUseMcpClientFactory } from './desktop-browser-use-mcp-client-factory';
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

  it('projects Browser Use as one user-confirmed origin on one session-owned client', async () => {
    const inspectionClient = client({
      tools: [
        {
          name: 'browser_get_state',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        {
          name: 'browser_get_html',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        {
          name: 'browser_screenshot',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnlyHint: true, destructiveHint: false },
        },
        {
          name: 'browser_navigate',
          inputSchema: { type: 'object', properties: { url: {}, new_tab: {} } },
        },
        {
          name: 'browser_list_tabs',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
    const sessionClient = client({
      tools: [],
      callTool: async () => ({
        content: [
          { type: 'text', text: '{"url":"https://example.test"}' },
          { type: 'image', data: PNG_BASE64, mimeType: 'image/png' },
        ],
      }),
    });
    const createBrowserClients = vi.fn((): DesktopBrowserUseMcpClientFactory => ({
      createInspectionClient: () => inspectionClient,
      createSessionClient: () => sessionClient,
      inspectProvider: async () => ({
        server: { name: 'browser-use', version: 'fixture' },
        tools: [],
      }),
      revalidateSessionTarget: async ({ target }) => target,
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
      createBrowserClients,
    });

    const contribution = await adapter.build({
      pluginId: 'browser-use@openneko',
      pluginRoot: '/fixture/browser-use',
      mcpServerIds: ['browser-use'],
      appIds: [],
      mcpToolExposure: 'adapter-only',
    });

    expect(contribution?.tools.map((tool) => tool.name)).toEqual([
      'automation_browser-use_browser_get_state',
      'automation_browser-use_browser_get_html',
      'automation_browser-use_browser_screenshot',
    ]);
    expect(contribution?.tools.map((tool) => tool.name)).not.toContain('browser_navigate');
    expect(createBrowserClients).toHaveBeenCalledWith({
      executablePath: '/Users/fixture/.local/bin/browser-use',
      browserExecutablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      storageRoot: '/tmp/openneko-automation-fixture/browser-use',
    });

    const toolResult = await contribution?.tools[2]?.execute(
      {
        arguments: { full_page: false },
        timeoutMs: 30_000,
        stepBudget: 1,
        targetOrigin: 'https://example.test',
      },
      {
        metadata: {
          workspaceId: 'workspace-1',
          conversationId: 'conversation-1',
          runId: 'run-1',
          toolCallId: 'tool-call-browser-1',
        },
      },
    );
    expect(toolResult).toMatchObject({ success: true, attachments: [{ type: 'image' }] });
    expect(sessionClient.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'browser_screenshot', arguments: { full_page: false } }),
    );

    await contribution?.dispose();
    await adapter.dispose();
  });
});

function localRuntimeHost(): DesktopAutomationLocalRuntimeHost {
  const runtimes = [
    {
      sourceId: 'browser-use.observe.local',
      displayName: 'Browser Use',
      providerKind: 'browser' as const,
      installationGuideUrl: 'https://docs.browser-use.com',
      installationCommand: "uv tool install 'browser-use[cli]'",
      authorized: true,
      runtimeId: 'local-runtime:browser-fixture',
      state: 'ready' as const,
      assets: [
        {
          key: 'provider-runtime' as const,
          label: 'Browser Use runtime',
          authorized: true,
          runtimeId: 'local-runtime-asset:browser-runtime-fixture',
          displayName: 'browser-use',
          status: 'valid' as const,
        },
        {
          key: 'browser-executable' as const,
          label: 'Browser executable',
          authorized: true,
          runtimeId: 'local-runtime-asset:browser-executable-fixture',
          displayName: 'Google Chrome',
          status: 'valid' as const,
        },
      ],
      diagnostics: [],
    },
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
    resolve: async (sourceId) =>
      sourceId === 'browser-use.observe.local'
        ? {
            sourceId,
            runtimeId: 'local-runtime:browser-fixture',
            assets: {
              'provider-runtime': '/Users/fixture/.local/bin/browser-use',
              'browser-executable': '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            },
          }
        : {
            sourceId: 'computer-use.observe.local',
            runtimeId: 'local-runtime:cua-fixture',
            assets: { 'provider-runtime': '/Applications/CuaDriver.app' },
          },
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

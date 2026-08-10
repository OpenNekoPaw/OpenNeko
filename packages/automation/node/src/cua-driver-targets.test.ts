import { describe, expect, it, vi } from 'vitest';
import type { AutomationMcpClientPort } from './session-owned-mcp-runtime';
import { createCuaDriverComputerTargetDiscovery } from './cua-driver-targets';

describe('Cua Driver Computer target discovery', () => {
  it('projects only exact visible current-Space windows behind opaque target keys', async () => {
    const client = createClient();
    const discovery = createCuaDriverComputerTargetDiscovery({
      clients: { createTargetDiscoveryClient: () => client },
      createTargetKey: () => 'opaque-target-1',
    });

    await expect(discovery.listCandidates()).resolves.toEqual([
      {
        kind: 'computer',
        targetKey: 'opaque-target-1',
        applicationId: 'com.example.Editor',
        processId: 42,
        windowId: '701',
        label: 'Editor — Project.neko',
        region: { x: 10, y: 20, width: 800, height: 600 },
      },
    ]);
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'list_windows',
      arguments: { on_screen_only: true },
    });
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it('revalidates the exact pid, bundle, window and current geometry without replacement', async () => {
    const client = createClient();
    const discovery = createCuaDriverComputerTargetDiscovery({
      clients: { createTargetDiscoveryClient: () => client },
    });
    const expected = {
      kind: 'computer' as const,
      targetKey: 'opaque-target-1',
      applicationId: 'com.example.Editor',
      processId: 42,
      windowId: '701',
      label: 'Editor — Old title',
      region: { x: 1, y: 2, width: 3, height: 4 },
    };

    await expect(discovery.revalidate({ target: expected })).resolves.toEqual({
      ...expected,
      label: 'Editor — Project.neko',
      region: { x: 10, y: 20, width: 800, height: 600 },
    });
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'list_windows',
      arguments: { pid: 42, on_screen_only: true },
    });
  });

  it('rejects changed discovery schemas before reading private Desktop metadata', async () => {
    const client = createClient();
    client.listTools = vi.fn(async () => [
      tool('list_apps', { type: 'object', properties: {}, additionalProperties: false }),
      tool('list_windows', { type: 'object', properties: {}, additionalProperties: false }),
    ]);
    const discovery = createCuaDriverComputerTargetDiscovery({
      clients: { createTargetDiscoveryClient: () => client },
    });

    await expect(discovery.listCandidates()).rejects.toThrow(
      "Cua Driver target Tool 'list_windows' schema changed.",
    );
    expect(client.callTool).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it('rejects stale windows instead of falling back to another visible candidate', async () => {
    const client = createClient({ includeExpectedWindow: false });
    const discovery = createCuaDriverComputerTargetDiscovery({
      clients: { createTargetDiscoveryClient: () => client },
    });

    await expect(
      discovery.revalidate({
        target: {
          kind: 'computer',
          targetKey: 'opaque-target-1',
          applicationId: 'com.example.Editor',
          processId: 42,
          windowId: '701',
          label: 'Editor',
          region: { x: 10, y: 20, width: 800, height: 600 },
        },
      }),
    ).rejects.toThrow('Cua Driver target window is no longer visible.');
  });

  it('rejects repeated opaque target identities from the Host issuer', async () => {
    const client = createClient({ includeSecondVisibleWindow: true });
    const discovery = createCuaDriverComputerTargetDiscovery({
      clients: { createTargetDiscoveryClient: () => client },
      createTargetKey: () => 'repeated-target',
    });

    await expect(discovery.listCandidates()).rejects.toThrow(
      "Computer target issuer repeated opaque identity 'repeated-target'.",
    );
  });
});

function createClient(
  options: {
    readonly includeExpectedWindow?: boolean;
    readonly includeSecondVisibleWindow?: boolean;
  } = {},
) {
  const includeExpectedWindow = options.includeExpectedWindow ?? true;
  const includeSecondVisibleWindow = options.includeSecondVisibleWindow ?? false;
  const client: AutomationMcpClientPort = {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    listTools: vi.fn(async () => [
      tool('list_apps', {
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      tool('list_windows', {
        type: 'object',
        properties: {
          pid: {
            type: 'integer',
            description: "Optional pid filter. When set, only this pid's windows are returned.",
          },
          on_screen_only: {
            type: 'boolean',
            description: 'When true, drop windows not on the current Space. Default false.',
          },
        },
        additionalProperties: false,
      }),
    ]),
    callTool: vi.fn(async (input) => {
      if (input.name === 'list_apps') return applicationsResult();
      if (input.name === 'list_windows') {
        return windowsResult(includeExpectedWindow, includeSecondVisibleWindow);
      }
      throw new Error(`Unexpected Tool '${input.name}'.`);
    }),
  };
  return client;
}

function tool(name: string, inputSchema: Readonly<Record<string, unknown>>) {
  return {
    name,
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false },
  };
}

function applicationsResult() {
  return {
    content: [{ type: 'text' as const, text: 'Found apps.' }],
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
        {
          pid: 0,
          name: 'Stopped',
          bundle_id: 'com.example.Stopped',
          active: false,
          running: false,
          launch_path: '/Applications/Stopped.app',
          kind: 'desktop',
          last_used: null,
          windows: [],
        },
      ],
    },
  };
}

function windowsResult(includeExpectedWindow: boolean, includeSecondVisibleWindow = false) {
  const window = (
    windowId: number,
    onCurrentSpace: boolean,
    bounds = { x: 10, y: 20, width: 800, height: 600 },
  ) => ({
    window_id: windowId,
    pid: 42,
    app_name: 'Editor',
    title: windowId === 701 ? 'Project.neko' : 'Other',
    bounds,
    layer: 0,
    z_index: 1,
    is_on_screen: onCurrentSpace,
    current_space_id: 1,
    on_current_space: onCurrentSpace,
    space_ids: [1],
  });
  return {
    content: [{ type: 'text' as const, text: 'Found windows.' }],
    structuredContent: {
      windows: [
        ...(includeExpectedWindow ? [window(701, true)] : []),
        ...(includeSecondVisibleWindow ? [window(704, true)] : []),
        window(702, false),
        window(703, true, { x: 0, y: 0, width: 0, height: 10 }),
      ],
      current_space_id: 1,
    },
  };
}

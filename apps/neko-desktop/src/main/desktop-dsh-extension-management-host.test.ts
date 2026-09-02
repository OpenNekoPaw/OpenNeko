import { describe, expect, it, vi } from 'vitest';

import { DesktopDshExtensionManagementHost } from './desktop-dsh-extension-management-host';

describe('DesktopDshExtensionManagementHost', () => {
  it('requests an active-work-aware DSH refresh after changing personal Skill discovery state', async () => {
    const runtime = createRuntime();
    const host = createHost(runtime);

    await host.execute(sender, {
      requestId: 'request-skill-disable',
      identity: { windowId: 'window-1' },
      route: 'skill.enablement.update',
      name: 'review',
      source: 'user-dsh',
      enabled: false,
    });

    expect(runtime.client.setSkillEnabled).toHaveBeenCalledWith({
      name: 'review',
      source: 'user-dsh',
      enabled: false,
    });
    expect(runtime.refreshConfiguration).toHaveBeenCalledTimes(1);
    expect(runtime.client.readExtensions).toHaveBeenCalledTimes(1);
  });

  it('uses the same configuration refresh boundary for Skill import and exact removal', async () => {
    const runtime = createRuntime();
    const host = createHost(runtime);

    await host.execute(sender, {
      requestId: 'request-skill-add',
      identity: { windowId: 'window-1' },
      route: 'skill.add',
    });
    await host.execute(sender, {
      requestId: 'request-skill-remove',
      identity: { windowId: 'window-1' },
      route: 'skill.remove',
      name: 'review',
      source: 'user-dsh',
    });

    expect(runtime.client.removeSkill).toHaveBeenCalledWith({
      name: 'review',
      source: 'user-dsh',
    });
    expect(runtime.refreshConfiguration).toHaveBeenCalledTimes(2);
    expect(runtime.client.readExtensions).toHaveBeenCalledTimes(2);
  });

  it('hot-adds one MCP server without restarting the Agent runtime', async () => {
    const runtime = createRuntime();
    const host = createHost(runtime);

    await host.execute(sender, {
      requestId: 'request-mcp-add',
      identity: { windowId: 'window-1' },
      route: 'mcp.add',
      server: {
        serverName: 'review-tools',
        description: 'Local review tools.',
        transport: 'stdio',
        command: 'review-tools',
        args: ['serve'],
      },
    });

    expect(runtime.client.addMcp).toHaveBeenCalledWith({
      serverName: 'review-tools',
      description: 'Local review tools.',
      transport: 'stdio',
      command: 'review-tools',
      args: ['serve'],
    });
    expect(runtime.refreshConfiguration).not.toHaveBeenCalled();
    expect(runtime.client.readExtensions).toHaveBeenCalledTimes(1);
  });

  it('reads exact Skill detail without refreshing or rebuilding the catalog projection', async () => {
    const runtime = createRuntime();
    const host = createHost(runtime);

    await expect(
      host.execute(sender, {
        requestId: 'request-skill-detail',
        identity: { windowId: 'window-1' },
        route: 'skill.detail.get',
        name: 'review',
        source: 'bundled',
      }),
    ).resolves.toMatchObject({
      route: 'skill.detail.get',
      detail: {
        id: 'dsh-skill:bundled:review',
        content: '# Review',
      },
    });
    expect(runtime.client.readSkillDetail).toHaveBeenCalledWith({
      name: 'review',
      source: 'bundled',
    });
    expect(runtime.client.readExtensions).not.toHaveBeenCalled();
    expect(runtime.refreshConfiguration).not.toHaveBeenCalled();
  });

  it('rejects mutation from a different sender-bound Window', async () => {
    const runtime = createRuntime();
    const host = createHost(runtime);

    await expect(
      host.execute(sender, {
        requestId: 'request-mcp-remove',
        identity: { windowId: 'window-2' },
        route: 'mcp.remove',
        id: 'review-tools',
      }),
    ).rejects.toThrow(/sender-bound window/u);
    expect(runtime.client.removeMcp).not.toHaveBeenCalled();
  });
});

const sender = { webContentsId: 7, frameUrl: 'file:///renderer/index.html' } as const;

function createHost(runtime: ReturnType<typeof createRuntime>) {
  return new DesktopDshExtensionManagementHost({
    runtime,
    skills: { add: vi.fn(async () => true) },
    windows: {
      resolveSender: vi.fn(() => ({
        windowId: 'window-1',
        rendererSessionId: 'renderer-session-1',
      })),
    },
  });
}

function createRuntime() {
  return {
    getStatus: vi.fn(() => ({ status: 'running' as const })),
    refreshConfiguration: vi.fn(async () => 'pending' as const),
    client: {
      readExtensions: vi.fn(async () => ({
        catalogScope: 'global' as const,
        skills: [],
        mcp: [],
        diagnostics: [],
      })),
      readSkillDetail: vi.fn(async ({ name, source }) => ({
        name,
        description: 'Review drafts.',
        source,
        provider: 'filesystem',
        userInvocable: true,
        modelInvocable: true,
        content: '# Review',
        fingerprint: `sha256:${'c'.repeat(64)}`,
      })),
      setSkillEnabled: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      addMcp: vi.fn(async () => undefined),
      setMcpEnabled: vi.fn(async () => undefined),
      removeMcp: vi.fn(async () => undefined),
    },
  };
}

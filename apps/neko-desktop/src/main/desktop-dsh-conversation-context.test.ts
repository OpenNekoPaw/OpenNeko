import { describe, expect, it, vi } from 'vitest';

import { resolveDesktopDshConversationContext } from './desktop-dsh-conversation-context';

const assistantBinding = {
  kind: 'assistant' as const,
  assistantSpaceId: 'assistant-space:local-user',
  baseGrantIds: [],
};

describe('Desktop DSH Conversation context', () => {
  it('keeps the exact Surface binding without touching Project authority', async () => {
    const resolveProjectWorkspace = vi.fn();
    const authorizeWorkspace = vi.fn();

    await expect(
      resolveDesktopDshConversationContext({
        windowId: 'window-1',
        target: { kind: 'surface' },
        surfaceBinding: assistantBinding,
        surfaceIsUnbound: true,
        projects: { resolveProjectWorkspace },
        workspaceGrants: { authorizeWorkspace },
      }),
    ).resolves.toEqual(assistantBinding);
    expect(resolveProjectWorkspace).not.toHaveBeenCalled();
    expect(authorizeWorkspace).not.toHaveBeenCalled();
  });

  it('resolves a stable Project choice and signs its exact Workspace grant', async () => {
    const resolveProjectWorkspace = vi.fn(async () => ({ workspaceId: 'workspace-1' }));
    const authorizeWorkspace = vi.fn(async () => ({
      grant: { workspaceGrantId: 'workspace-grant-1' },
      workspace: { workspaceId: 'workspace-1' },
    }));

    await expect(
      resolveDesktopDshConversationContext({
        windowId: 'window-1',
        target: { kind: 'project', projectId: 'project-1' },
        surfaceBinding: assistantBinding,
        surfaceIsUnbound: true,
        projects: { resolveProjectWorkspace },
        workspaceGrants: { authorizeWorkspace },
      }),
    ).resolves.toEqual({
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });
    expect(resolveProjectWorkspace).toHaveBeenCalledWith('project-1');
    expect(authorizeWorkspace).toHaveBeenCalledWith({
      windowId: 'window-1',
      workspaceId: 'workspace-1',
    });
  });

  it('rejects Project rebinding and a cross-Workspace grant locally', async () => {
    const resolveProjectWorkspace = vi.fn(async () => ({ workspaceId: 'workspace-1' }));
    const authorizeWorkspace = vi.fn(async () => ({
      grant: { workspaceGrantId: 'workspace-grant-other' },
      workspace: { workspaceId: 'workspace-other' },
    }));
    const base = {
      windowId: 'window-1',
      target: { kind: 'project' as const, projectId: 'project-1' },
      surfaceBinding: assistantBinding,
      projects: { resolveProjectWorkspace },
      workspaceGrants: { authorizeWorkspace },
    };

    await expect(
      resolveDesktopDshConversationContext({ ...base, surfaceIsUnbound: false }),
    ).rejects.toThrow(/unbound Agent Draft/u);
    expect(resolveProjectWorkspace).not.toHaveBeenCalled();

    await expect(
      resolveDesktopDshConversationContext({ ...base, surfaceIsUnbound: true }),
    ).rejects.toThrow(/resolved to another Workspace/u);
  });
});

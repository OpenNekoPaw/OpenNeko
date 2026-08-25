import { describe, expect, it, vi } from 'vitest';

import {
  resolveDesktopDshConversationContext,
  resolveDesktopDshSurfaceConversationContext,
} from './desktop-dsh-conversation-context';

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
    ).resolves.toEqual({ context: assistantBinding, surfaceBinding: assistantBinding });
    expect(resolveProjectWorkspace).not.toHaveBeenCalled();
    expect(authorizeWorkspace).not.toHaveBeenCalled();
  });

  it('rejects a durable context that does not project to the authorized Surface', async () => {
    await expect(
      resolveDesktopDshConversationContext({
        windowId: 'window-1',
        target: { kind: 'surface' },
        surfaceBinding: assistantBinding,
        surfaceContext: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        surfaceIsUnbound: true,
        projects: { resolveProjectWorkspace: vi.fn() },
        workspaceGrants: { authorizeWorkspace: vi.fn() },
      }),
    ).rejects.toThrow(/authorized Agent Surface/u);
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
      context: {
        kind: 'authoring',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
        authority: { kind: 'project', projectId: 'project-1' },
        target: null,
      },
      surfaceBinding: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    });
    expect(resolveProjectWorkspace).toHaveBeenCalledWith('project-1');
    expect(authorizeWorkspace).toHaveBeenCalledWith({
      windowId: 'window-1',
      workspaceId: 'workspace-1',
    });
  });

  it('binds one exact visible authoring surface without reading Renderer state', () => {
    expect(
      resolveDesktopDshSurfaceConversationContext({
        surfaceBinding: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        workbench: {
          scene: {
            slots: {
              main: {
                kind: 'character-authoring',
                workspaceId: 'workspace-1',
                authority: { kind: 'project', projectId: 'project-1' },
                viewId: 'view-1',
                viewInstanceId: 'instance-1',
                characterProjectId: 'character-project-1',
              },
            },
          },
        },
      }),
    ).toEqual({
      kind: 'authoring',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      authority: { kind: 'project', projectId: 'project-1' },
      target: { kind: 'character-project', characterProjectId: 'character-project-1' },
    });
  });

  it('rejects ambiguous visible Character and World authoring surfaces', () => {
    expect(() =>
      resolveDesktopDshSurfaceConversationContext({
        surfaceBinding: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        workbench: {
          scene: {
            slots: {
              main: {
                kind: 'character-authoring',
                workspaceId: 'workspace-1',
                authority: { kind: 'project', projectId: 'project-1' },
                viewId: 'view-1',
                viewInstanceId: 'instance-1',
                characterProjectId: 'character-project-1',
              },
              secondaryMain: {
                kind: 'world-authoring',
                workspaceId: 'workspace-1',
                authority: { kind: 'project', projectId: 'project-1' },
                viewId: 'view-2',
                viewInstanceId: 'instance-2',
                worldProjectId: 'world-project-1',
              },
            },
          },
        },
      }),
    ).toThrow(/exactly one visible/u);
  });

  it('rejects a cross-Workspace authoring surface before Conversation publication', () => {
    expect(() =>
      resolveDesktopDshSurfaceConversationContext({
        surfaceBinding: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        workbench: {
          scene: {
            slots: {
              main: {
                kind: 'character-authoring',
                workspaceId: 'workspace-other',
                authority: { kind: 'project', projectId: 'project-1' },
                viewId: 'view-1',
                viewInstanceId: 'instance-1',
                characterProjectId: 'character-project-1',
              },
            },
          },
        },
      }),
    ).toThrow(/authorized Workspace/u);
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

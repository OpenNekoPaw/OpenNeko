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
    const resolveWorkspace = vi.fn();
    const requireAuthoringTarget = vi.fn();

    await expect(
      resolveDesktopDshConversationContext({
        windowId: 'window-1',
        target: { kind: 'surface' },
        surfaceBinding: assistantBinding,
        surfaceIsUnbound: true,
        projects: { resolveProjectWorkspace },
        workspaceGrants: { resolve: resolveWorkspace },
        authoringTargets: { require: requireAuthoringTarget },
      }),
    ).resolves.toEqual({ context: assistantBinding, surfaceBinding: assistantBinding });
    expect(resolveProjectWorkspace).not.toHaveBeenCalled();
    expect(resolveWorkspace).not.toHaveBeenCalled();
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
        workspaceGrants: { resolve: vi.fn() },
        authoringTargets: { require: vi.fn() },
      }),
    ).rejects.toThrow(/authorized Agent Surface/u);
  });

  it('accepts an exact Project authoring context without fabricating a domain target', async () => {
    const resolveProjectWorkspace = vi.fn(async () => ({ workspaceId: 'workspace-1' }));
    const resolveWorkspace = vi.fn(async () => ({ workspace: { workspaceId: 'workspace-1' } }));
    const target = {
      kind: 'authoring' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
      authority: { kind: 'project' as const, projectId: 'project-1' },
      target: null,
    };

    await expect(
      resolveDesktopDshConversationContext({
        windowId: 'window-1',
        target,
        surfaceBinding: assistantBinding,
        surfaceIsUnbound: true,
        projects: { resolveProjectWorkspace },
        workspaceGrants: { resolve: resolveWorkspace },
        authoringTargets: { require: vi.fn() },
      }),
    ).resolves.toEqual({
      context: target,
      surfaceBinding: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    });
    expect(resolveProjectWorkspace).toHaveBeenCalledWith('project-1');
    expect(resolveWorkspace).toHaveBeenCalledWith('window-1', 'workspace-grant-1');
  });

  it('accepts an exact Project-local Character target after Host authorization', async () => {
    const binding = {
      kind: 'authoring' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      authority: { kind: 'project' as const, projectId: 'project-1' },
      target: {
        kind: 'character-project' as const,
        characterProjectId: 'character-project-1',
      },
    };
    const workspace = { workspaceId: 'workspace-1', marker: 'authorized' };
    const requireTarget = vi.fn(async () => undefined);

    await expect(
      resolveDesktopDshConversationContext({
        windowId: 'window-1',
        target: binding,
        surfaceBinding: assistantBinding,
        surfaceIsUnbound: true,
        projects: {
          resolveProjectWorkspace: vi.fn(async () => ({ workspaceId: 'workspace-1' })),
        },
        workspaceGrants: {
          resolve: vi.fn(async () => ({ workspace })),
        },
        authoringTargets: { require: requireTarget },
      }),
    ).resolves.toEqual({
      context: binding,
      surfaceBinding: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
      },
    });
    expect(requireTarget).toHaveBeenCalledWith({
      workspace,
      projectId: 'project-1',
      target: binding.target,
    });
  });

  it('rejects forged authoring Workspace identity and unavailable local targets', async () => {
    const target = {
      kind: 'authoring' as const,
      workspaceId: 'workspace-forged',
      workspaceGrantId: 'grant-1',
      authority: { kind: 'project' as const, projectId: 'project-1' },
      target: {
        kind: 'character-project' as const,
        characterProjectId: 'character-project-1',
      },
    };
    const base = {
      windowId: 'window-1',
      target,
      surfaceBinding: assistantBinding,
      surfaceIsUnbound: true,
      projects: {
        resolveProjectWorkspace: vi.fn(async () => ({ workspaceId: 'workspace-1' })),
      },
      workspaceGrants: {
        resolve: vi.fn(async () => ({ workspace: { workspaceId: 'workspace-forged' } })),
      },
      authoringTargets: { require: vi.fn() },
    };

    await expect(resolveDesktopDshConversationContext(base)).rejects.toThrow(
      /belongs to another Workspace/u,
    );

    await expect(
      resolveDesktopDshConversationContext({
        ...base,
        target: { ...target, workspaceId: 'workspace-1' },
        workspaceGrants: {
          resolve: vi.fn(async () => ({ workspace: { workspaceId: 'workspace-1' } })),
        },
        authoringTargets: {
          require: vi.fn(async () => {
            throw new Error('CharacterProject is unavailable.');
          }),
        },
      }),
    ).rejects.toThrow(/CharacterProject is unavailable/u);
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
    const base = {
      windowId: 'window-1',
      target: {
        kind: 'authoring' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-other',
        authority: { kind: 'project' as const, projectId: 'project-1' },
        target: null,
      },
      surfaceBinding: assistantBinding,
      projects: { resolveProjectWorkspace },
      workspaceGrants: {
        resolve: vi.fn(async () => ({ workspace: { workspaceId: 'workspace-other' } })),
      },
      authoringTargets: { require: vi.fn() },
    };

    await expect(
      resolveDesktopDshConversationContext({ ...base, surfaceIsUnbound: false }),
    ).rejects.toThrow(/unbound Agent Draft/u);
    expect(resolveProjectWorkspace).not.toHaveBeenCalled();

    await expect(
      resolveDesktopDshConversationContext({ ...base, surfaceIsUnbound: true }),
    ).rejects.toThrow(/resolves to another Workspace/u);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  DesktopProjectManagementService,
  type DesktopProjectManagementShellPort,
} from './desktop-project-management-service';
import type {
  DesktopAgentHomeNavigationIdentity,
  DesktopShellProjection,
} from './desktop-shell-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from './desktop-scene-contract';
import { createDesktopWindowComposition } from './desktop-window-composition-contract';

describe('DesktopProjectManagementService', () => {
  it('removes Project registration without invoking Agent conversation deletion', async () => {
    const retainedConversation = workspaceConversation('conversation:project-1');
    const removedProjection = projection([retainedConversation]);
    const shell = createShell({
      conversations: [retainedConversation],
      projection: removedProjection,
    });
    const deleteConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.removeProjects('window-1', 'renderer-session-1', ['content:workspace-1']),
    ).resolves.toBe(removedProjection);
    expect(shell.removeProjectsFromCatalog).toHaveBeenCalledWith(
      'window-1',
      ['content:workspace-1'],
      'renderer-session-1',
    );
    expect(shell.resolveProjectWorkspaceConversations).not.toHaveBeenCalled();
    expect(deleteConversations).not.toHaveBeenCalled();
  });

  it('deletes only exact Workspace conversations selected by Shell authority', async () => {
    const conversations = [
      workspaceConversation('conversation:project-1'),
      workspaceConversation('conversation:project-2'),
    ];
    const finalProjection = projection([]);
    const shell = createShell({ conversations, projection: finalProjection });
    const deleteConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.deleteProjectConversations('window-1', 'renderer-session-1', ['content:workspace-1']),
    ).resolves.toBe(finalProjection);
    expect(shell.resolveProjectWorkspaceConversations).toHaveBeenCalledWith(
      'window-1',
      ['content:workspace-1'],
      'renderer-session-1',
    );
    expect(deleteConversations).toHaveBeenCalledWith(conversations);
    expect(shell.getProjection).toHaveBeenCalledWith('window-1');
    expect(shell.removeProjectsFromCatalog).not.toHaveBeenCalled();
  });

  it('keeps an empty cleanup request inside Shell validation without invoking Agent authority', async () => {
    const finalProjection = projection([]);
    const shell = createShell({ conversations: [], projection: finalProjection });
    const deleteConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.deleteProjectConversations('window-1', 'renderer-session-1', ['content:workspace-1']),
    ).resolves.toBe(finalProjection);
    expect(deleteConversations).not.toHaveBeenCalled();
  });

  it('does not delete conversations when complete Project validation fails', async () => {
    const validationError = new Error('Unknown Desktop Project');
    const shell = createShell({ conversations: [], projection: projection([]) });
    shell.resolveProjectWorkspaceConversations.mockRejectedValue(validationError);
    const deleteConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.deleteProjectConversations('window-1', 'renderer-session-1', ['content:missing']),
    ).rejects.toBe(validationError);
    expect(deleteConversations).not.toHaveBeenCalled();
    expect(shell.getProjection).not.toHaveBeenCalled();
  });
});

function createShell({
  conversations,
  projection: finalProjection,
}: {
  readonly conversations: readonly DesktopAgentHomeNavigationIdentity[];
  readonly projection: DesktopShellProjection;
}): DesktopProjectManagementShellPort & {
  readonly getProjection: ReturnType<typeof vi.fn>;
  readonly removeProjectsFromCatalog: ReturnType<typeof vi.fn>;
  readonly resolveProjectWorkspaceConversations: ReturnType<typeof vi.fn>;
} {
  return {
    removeProjectsFromCatalog: vi.fn(async () => ({ projection: finalProjection })),
    resolveProjectWorkspaceConversations: vi.fn(async () => conversations),
    getProjection: vi.fn(async () => finalProjection),
  };
}

function workspaceConversation(conversationId: string): DesktopAgentHomeNavigationIdentity {
  return {
    conversationId,
    owner: { kind: 'workspace', workspaceId: 'workspace-1' },
  };
}

function projection(
  conversations: readonly DesktopAgentHomeNavigationIdentity[],
): DesktopShellProjection {
  const scene = createDefaultDesktopAgentScene('window-1', 'draft:test');
  const workbench = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:window-1:entry',
    layout: createDefaultDesktopWorkbenchLayout('window-1'),
    scene,
  });
  const summaries = conversations.map((navigation) => ({
    navigation,
    title: navigation.conversationId,
    updatedAt: '2026-08-07T00:00:00.000Z',
    attention: 'none' as const,
    lastActivity: {
      kind: 'conversation-updated' as const,
      occurredAt: '2026-08-07T00:00:00.000Z',
    },
  }));
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'renderer-session-1',
    catalog: { projects: [] },
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      conversations: summaries,
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    conversationNavigation: { recentProjectIds: [], groups: [] },
    domains: [],
  };
}

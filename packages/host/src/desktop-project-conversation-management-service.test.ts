import { describe, expect, it, vi } from 'vitest';
import {
  DesktopProjectConversationManagementService,
  type DesktopProjectCatalogRemovalPort,
} from './desktop-project-conversation-management-service';
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

describe('DesktopProjectConversationManagementService', () => {
  it('deletes the exact captured Project conversations before returning the final projection', async () => {
    const events: string[] = [];
    const conversation = workspaceConversation('conversation:project-1');
    const finalProjection = projection([]);
    const shell = createShell({
      conversations: [conversation],
      projection: finalProjection,
      onCommit: () => events.push('project-commit'),
      onProjection: () => events.push('projection'),
    });
    const deleteConversations = vi.fn(async (conversations) => {
      events.push('conversation-delete');
      expect(conversations).toEqual([conversation]);
    });
    const service = new DesktopProjectConversationManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.deleteProjects('window-1', 'renderer-session-1', ['content:workspace-1']),
    ).resolves.toBe(finalProjection);
    expect(events).toEqual(['project-commit', 'conversation-delete', 'projection']);
  });

  it('does not call Agent conversation deletion for an empty Project group', async () => {
    const finalProjection = projection([]);
    const shell = createShell({ conversations: [], projection: finalProjection });
    const deleteConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectConversationManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.deleteProjects('window-1', 'renderer-session-1', ['content:workspace-1']),
    ).resolves.toBe(finalProjection);
    expect(deleteConversations).not.toHaveBeenCalled();
  });

  it('does not delete conversations when Project validation fails before commit', async () => {
    const validationError = new Error('Unknown Desktop Project');
    const shell: DesktopProjectCatalogRemovalPort = {
      removeProjectsFromCatalog: vi.fn(async () => {
        throw validationError;
      }),
      getProjection: vi.fn(async () => projection([])),
    };
    const deleteConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectConversationManagementService({
      shell,
      conversations: { deleteConversations },
    });

    await expect(
      service.deleteProjects('window-1', 'renderer-session-1', ['content:missing']),
    ).rejects.toBe(validationError);
    expect(deleteConversations).not.toHaveBeenCalled();
    expect(shell.getProjection).not.toHaveBeenCalled();
  });

  it('fails visibly after Project commit and leaves undeleted conversations projected locally', async () => {
    const conversation = workspaceConversation('conversation:project-1');
    const unavailableProjection = projection([conversation]);
    const shell = createShell({
      conversations: [conversation],
      projection: unavailableProjection,
    });
    const deletionError = new Error('Conversation authority rejected deletion.');
    const service = new DesktopProjectConversationManagementService({
      shell,
      conversations: {
        deleteConversations: vi.fn(async () => {
          throw deletionError;
        }),
      },
    });

    await expect(
      service.deleteProjects('window-1', 'renderer-session-1', ['content:workspace-1']),
    ).rejects.toBe(deletionError);
    await expect(shell.getProjection('window-1')).resolves.toMatchObject({
      catalog: { projects: [] },
      conversationNavigation: {
        groups: [
          {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            conversations: [{ navigation: conversation }],
          },
        ],
      },
    });
  });
});

function createShell({
  conversations,
  projection: finalProjection,
  onCommit,
  onProjection,
}: {
  readonly conversations: readonly DesktopAgentHomeNavigationIdentity[];
  readonly projection: DesktopShellProjection;
  readonly onCommit?: () => void;
  readonly onProjection?: () => void;
}): DesktopProjectCatalogRemovalPort {
  return {
    removeProjectsFromCatalog: vi.fn(async () => {
      onCommit?.();
      return { conversations, projection: finalProjection };
    }),
    getProjection: vi.fn(async () => {
      onProjection?.();
      return finalProjection;
    }),
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
    unavailable: {
      code: 'agent-conversation-unavailable' as const,
      fieldNames: ['workspaceId'],
      message: 'Workspace is not present in the Project catalog.',
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
    conversationNavigation: {
      groups:
        summaries.length === 0
          ? []
          : [
              {
                kind: 'workspace',
                workspaceId: 'workspace-1',
                fieldNames: ['workspaceId'],
                message: 'Workspace is not present in the Project catalog.',
                conversations: summaries,
              },
            ],
    },
    domains: [],
  };
}

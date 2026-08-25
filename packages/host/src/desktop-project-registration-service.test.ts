import { access, readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  DesktopProjectRegistrationService,
  type DesktopProjectRegistrationShellPort,
} from './desktop-project-registration-service';
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

describe('DesktopProjectRegistrationService', () => {
  it('keeps the deleted Project business owner path unreachable', async () => {
    await expect(
      access(new URL('./desktop-project-management-service.ts', import.meta.url)),
    ).rejects.toBeDefined();
    const source = await readFile(
      new URL('./desktop-project-registration-service.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/@neko\/project|ContentProjectComposition|project-composition/u);
  });

  it('removes Project registration without invoking Agent conversation archive', async () => {
    const retainedConversation = workspaceConversation('conversation:project-1');
    const removedProjection = projection([retainedConversation]);
    const shell = createShell({
      conversations: [retainedConversation],
      projection: removedProjection,
    });
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
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
    expect(archiveConversations).not.toHaveBeenCalled();
  });

  it('archives only exact Workspace conversations selected by Shell authority', async () => {
    const conversations = [
      workspaceConversation('conversation:project-1'),
      workspaceConversation('conversation:project-2'),
    ];
    const finalProjection = projection([]);
    const shell = createShell({ conversations, projection: finalProjection });
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
    });

    await expect(
      service.archiveProjectConversations('window-1', 'renderer-session-1', [
        'content:workspace-1',
      ]),
    ).resolves.toBe(finalProjection);
    expect(shell.resolveProjectWorkspaceConversations).toHaveBeenCalledWith(
      'window-1',
      ['content:workspace-1'],
      'renderer-session-1',
    );
    expect(archiveConversations).toHaveBeenCalledWith(conversations);
    expect(shell.getProjection).toHaveBeenCalledWith('window-1');
    expect(shell.removeProjectsFromCatalog).not.toHaveBeenCalled();
  });

  it('keeps an empty cleanup request inside Shell validation without invoking Agent authority', async () => {
    const finalProjection = projection([]);
    const shell = createShell({ conversations: [], projection: finalProjection });
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
    });

    await expect(
      service.archiveProjectConversations('window-1', 'renderer-session-1', [
        'content:workspace-1',
      ]),
    ).resolves.toBe(finalProjection);
    expect(archiveConversations).not.toHaveBeenCalled();
  });

  it('does not archive conversations when complete Project validation fails', async () => {
    const validationError = new Error('Unknown Desktop Project');
    const shell = createShell({ conversations: [], projection: projection([]) });
    shell.resolveProjectWorkspaceConversations.mockRejectedValue(validationError);
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
    });

    await expect(
      service.archiveProjectConversations('window-1', 'renderer-session-1', ['content:missing']),
    ).rejects.toBe(validationError);
    expect(archiveConversations).not.toHaveBeenCalled();
    expect(shell.getProjection).not.toHaveBeenCalled();
  });

  it('archives only the exact Conversations revalidated by Shell authority', async () => {
    const requested = [workspaceConversation('conversation:project-1')];
    const authoritative = [workspaceConversation('conversation:project-1')];
    const finalProjection = projection([]);
    const shell = createShell({ conversations: authoritative, projection: finalProjection });
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
    });

    await expect(
      service.archiveConversations('window-1', 'renderer-session-1', requested),
    ).resolves.toBe(finalProjection);
    expect(shell.resolveAgentHomeConversations).toHaveBeenCalledWith(
      'window-1',
      requested,
      'renderer-session-1',
    );
    expect(archiveConversations).toHaveBeenCalledWith(authoritative);
    expect(shell.getProjection).toHaveBeenCalledWith('window-1');
  });

  it('preserves every Conversation when authoritative navigation validation fails', async () => {
    const requested = [workspaceConversation('conversation:missing')];
    const validationError = new Error('Unknown Desktop Conversation');
    const shell = createShell({ conversations: [], projection: projection([]) });
    shell.resolveAgentHomeConversations.mockRejectedValue(validationError);
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
    });

    await expect(
      service.archiveConversations('window-1', 'renderer-session-1', requested),
    ).rejects.toBe(validationError);
    expect(archiveConversations).not.toHaveBeenCalled();
    expect(shell.getProjection).not.toHaveBeenCalled();
  });

  it('rejects an empty Conversation archive instead of reporting no-op success', async () => {
    const shell = createShell({ conversations: [], projection: projection([]) });
    const archiveConversations = vi.fn(async () => undefined);
    const service = new DesktopProjectRegistrationService({
      shell,
      conversations: conversationManagement(archiveConversations),
    });

    await expect(
      service.archiveConversations('window-1', 'renderer-session-1', []),
    ).rejects.toThrow(/At least one Agent Home Conversation/u);
    expect(shell.resolveAgentHomeConversations).not.toHaveBeenCalled();
    expect(archiveConversations).not.toHaveBeenCalled();
  });

  it('deletes only the exact unavailable Conversation revalidated by Shell authority', async () => {
    const requested = workspaceConversation('conversation:unavailable');
    const authoritative = workspaceConversation('conversation:unavailable');
    const finalProjection = projection([]);
    const shell = createShell({ conversations: [authoritative], projection: finalProjection });
    const archiveConversations = vi.fn(async () => undefined);
    const conversations = conversationManagement(archiveConversations);
    const service = new DesktopProjectRegistrationService({ shell, conversations });

    await expect(
      service.deleteUnavailableConversation('window-1', 'renderer-session-1', requested),
    ).resolves.toBe(finalProjection);
    expect(shell.resolveAgentHomeConversations).toHaveBeenCalledWith(
      'window-1',
      [requested],
      'renderer-session-1',
    );
    expect(conversations.deleteUnavailableConversation).toHaveBeenCalledWith(authoritative);
    expect(archiveConversations).not.toHaveBeenCalled();
  });
});

function conversationManagement(
  archiveConversations: (
    conversations: readonly DesktopAgentHomeNavigationIdentity[],
  ) => Promise<void>,
) {
  return {
    archiveConversations,
    deleteUnavailableConversation: vi.fn(async () => undefined),
  };
}

function createShell({
  conversations,
  projection: finalProjection,
}: {
  readonly conversations: readonly DesktopAgentHomeNavigationIdentity[];
  readonly projection: DesktopShellProjection;
}): DesktopProjectRegistrationShellPort & {
  readonly getProjection: ReturnType<typeof vi.fn>;
  readonly resolveAgentHomeConversations: ReturnType<typeof vi.fn>;
  readonly removeProjectsFromCatalog: ReturnType<typeof vi.fn>;
  readonly resolveProjectWorkspaceConversations: ReturnType<typeof vi.fn>;
} {
  return {
    removeProjectsFromCatalog: vi.fn(async () => ({ projection: finalProjection })),
    resolveAgentHomeConversations: vi.fn(async () => conversations),
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

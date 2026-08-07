import { describe, expect, it, vi } from 'vitest';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { DesktopWorkspaceGrantAuthority } from './desktop-workspace-grant-authority';
import { createCutHostSessionId } from '@neko/cut-domain';
import { DesktopShellService, type DesktopWorkspaceResolutionPort } from './desktop-shell-service';
import {
  createInMemoryDesktopShellStateRepository,
  type InMemoryDesktopShellStateRepository,
} from './testing/in-memory-desktop-shell-state-repository';
import { closeMainView, DESKTOP_PRIMARY_MAIN_GROUP_ID } from './desktop-workbench-contract';
import {
  createDesktopApplicationSidebarMutationRequest,
  createDesktopSceneTransitionRequest,
  parseDesktopWorkbenchSceneProjection,
} from './desktop-scene-contract';
import {
  createDesktopWindowComposition,
  type DesktopWindowCompositionProjection,
} from './desktop-window-composition-contract';
import type {
  DesktopProjectCatalogItem,
  DesktopShellStateDiagnosticProjection,
} from './desktop-shell-contract';

function activeInstance(window: { readonly workbench: DesktopWindowCompositionProjection }) {
  return window.workbench;
}

function activeScene(window: { readonly workbench: DesktopWindowCompositionProjection }) {
  return activeInstance(window).scene;
}

function activeWorkbench(window: { readonly workbench: DesktopWindowCompositionProjection }) {
  return activeInstance(window).layout;
}

describe('DesktopShellService', () => {
  it('projects startup state rejection diagnostics into a new Entry Draft Window', async () => {
    const diagnostic: DesktopShellStateDiagnosticProjection = {
      code: 'desktop-stored-state-invalid',
      severity: 'error',
      authorityKey: 'desktop.shell',
      rejectionId: 4,
      message: 'Stored Shell authority was rejected.',
    };
    const fixture = createFixture(undefined, 'home', undefined, true, [diagnostic]);

    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);

    expect(projection.stateDiagnostics).toEqual([diagnostic]);
    expect(projection.window.workbench.windowId).toBe(windowId);
    expect(activeScene(projection.window).context).toMatchObject({
      kind: 'agent',
      scope: { kind: 'unbound' },
    });
  });

  it('starts at Home by default without deleting restored project tabs', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await first.service.getProjection(windowId);
    const opened = await openContent(
      first,
      windowId,
      '/workspace/demo',
      projection.rendererSessionId,
    );
    expect(opened.projection.window.activeTarget.kind).toBe('project');
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindowId = await second.service.claimWindowId();
    second.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    const restored = await second.service.getProjection(restoredWindowId);

    expect(restored.window.activeTarget).toEqual({ kind: 'home' });
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.catalog.projects).toHaveLength(1);
  });

  it('opens and explicitly removes a Project retained by the stable Workspace authority', async () => {
    const retainedProject: DesktopProjectCatalogItem = {
      projectId: 'content:11111111-1111-4111-8111-111111111111',
      workspaceId: '11111111-1111-4111-8111-111111111111',
      profile: 'content',
      displayName: 'Retained Demo',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
    };
    const fixture = createFixture(undefined, 'home', undefined, true, [], [retainedProject]);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    let projection = await fixture.service.getProjection(windowId);

    expect(projection.catalog.projects).toEqual([retainedProject]);
    expect(projection.conversationNavigation).toEqual({ recentProjectIds: [], groups: [] });
    const opened = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'open-retained-project',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: { kind: 'open-project-workspace', projectId: retainedProject.projectId },
      }),
    );
    expect(opened.status).toBe('transitioned');
    expect(fixture.registry.restore).toHaveBeenCalledWith(retainedProject.workspaceId);

    projection = await fixture.service.getProjection(windowId);
    expect(projection.conversationNavigation).toMatchObject({
      recentProjectIds: [retainedProject.projectId],
      groups: [
        {
          kind: 'project',
          projectId: retainedProject.projectId,
          conversations: [],
        },
      ],
    });
    const removed = await fixture.service.removeProjectsFromCatalog(
      windowId,
      [retainedProject.projectId],
      projection.rendererSessionId,
    );
    expect(fixture.registry.removeProjects).toHaveBeenCalledWith([retainedProject.workspaceId]);
    expect(removed.projection.catalog.projects).toEqual([]);
  });

  it('removes a validated Project batch through one registry call and one state commit', async () => {
    const projects: readonly DesktopProjectCatalogItem[] = [
      {
        projectId: 'content:workspace-1',
        workspaceId: 'workspace-1',
        profile: 'content',
        displayName: 'First',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-06T00:00:00.000Z',
      },
      {
        projectId: 'content:workspace-2',
        workspaceId: 'workspace-2',
        profile: 'content',
        displayName: 'Second',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-07T00:00:00.000Z',
      },
    ];
    const repository = createInMemoryDesktopShellStateRepository();
    const commit = vi.spyOn(repository, 'commit');
    const fixture = createFixture(repository, 'home', undefined, true, [], projects);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);
    commit.mockClear();

    const removed = await fixture.service.removeProjectsFromCatalog(
      windowId,
      projects.map((project) => project.projectId),
      projection.rendererSessionId,
    );

    expect(fixture.registry.removeProjects).toHaveBeenCalledOnce();
    expect(fixture.registry.removeProjects).toHaveBeenCalledWith(['workspace-1', 'workspace-2']);
    expect(commit).toHaveBeenCalledOnce();
    expect(removed.projection.catalog.projects).toEqual([]);
  });

  it('selects only exact Workspace-owned conversations without coupling them to Project removal', async () => {
    const projects: readonly DesktopProjectCatalogItem[] = [
      {
        projectId: 'content:workspace-1',
        workspaceId: 'workspace-1',
        profile: 'content',
        displayName: 'First',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-06T00:00:00.000Z',
      },
      {
        projectId: 'content:workspace-2',
        workspaceId: 'workspace-2',
        profile: 'content',
        displayName: 'Second',
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-07T00:00:00.000Z',
      },
    ];
    const fixture = createFixture(undefined, 'home', undefined, true, [], projects);
    fixture.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [
          workspaceHomeConversation('conversation:first', 'workspace-1'),
          workspaceHomeConversation('conversation:second', 'workspace-2'),
          {
            ...workspaceHomeConversation('conversation:assistant', 'workspace-1'),
            groupedProjectId: 'content:workspace-1',
            navigation: {
              conversationId: 'conversation:assistant',
              owner: {
                kind: 'assistant' as const,
                assistantSpaceId: 'assistant-space:local-user',
              },
            },
          },
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);

    const conversations = await fixture.service.resolveProjectWorkspaceConversations(
      windowId,
      ['content:workspace-1'],
      projection.rendererSessionId,
    );

    expect(conversations).toEqual([
      {
        conversationId: 'conversation:first',
        owner: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
    ]);
    const removed = await fixture.service.removeProjectsFromCatalog(
      windowId,
      ['content:workspace-1'],
      projection.rendererSessionId,
    );
    expect(removed.projection.catalog.projects).toEqual([projects[1]]);
    expect(removed.projection.agentHome.conversations).toHaveLength(3);
    expect(removed.projection.conversationNavigation.groups).toEqual([
      expect.objectContaining({
        kind: 'project',
        projectId: 'content:workspace-2',
        conversations: [expect.objectContaining({ title: 'conversation:second' })],
      }),
      expect.objectContaining({
        kind: 'workspace',
        workspaceId: 'workspace-1',
        conversations: [expect.objectContaining({ title: 'conversation:first' })],
      }),
      expect.objectContaining({
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        conversations: [expect.objectContaining({ title: 'conversation:assistant' })],
      }),
    ]);
  });

  it('validates the complete Project conversation cleanup identity set before selecting targets', async () => {
    const project: DesktopProjectCatalogItem = {
      projectId: 'content:workspace-1',
      workspaceId: 'workspace-1',
      profile: 'content',
      displayName: 'First',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
    };
    const fixture = createFixture(undefined, 'home', undefined, true, [], [project]);
    fixture.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [workspaceHomeConversation('conversation:first', 'workspace-1')],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);

    await expect(
      fixture.service.resolveProjectWorkspaceConversations(
        windowId,
        [project.projectId, project.projectId],
        projection.rendererSessionId,
      ),
    ).rejects.toMatchObject({ code: 'invalid-desktop-shell-payload' });
    await expect(
      fixture.service.resolveProjectWorkspaceConversations(
        windowId,
        [project.projectId, 'content:missing'],
        projection.rendererSessionId,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-project-not-found' });
    expect(fixture.registry.removeProjects).not.toHaveBeenCalled();
    expect((await fixture.service.getProjection(windowId)).agentHome.conversations).toHaveLength(1);
  });

  it('retains Workspace conversations when no Project is open', async () => {
    const fixture = createFixture();
    fixture.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [
          {
            navigation: {
              conversationId: 'conversation-unavailable-workspace',
              owner: { kind: 'workspace', workspaceId: 'workspace-not-open' },
            },
            title: 'Unavailable Workspace conversation',
            updatedAt: '2026-08-06T00:00:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-08-06T00:00:00.000Z',
            },
          },
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });

    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);

    expect(projection.catalog.projects).toEqual([]);
    expect(projection.conversationNavigation.groups).toMatchObject([
      {
        kind: 'workspace',
        workspaceId: 'workspace-not-open',
        fieldNames: ['workspaceId'],
        conversations: [
          {
            navigation: { conversationId: 'conversation-unavailable-workspace' },
          },
        ],
      },
    ]);
  });

  it('rejects a persisted Agent Surface whose Conversation no longer matches its canonical owner', async () => {
    const repository = createMemoryFile();
    const first = createFixture(repository, 'restore');
    const homeConversation = (conversationId: string) => ({
      navigation: {
        conversationId,
        owner: {
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-space:local-user',
        },
      },
      title: conversationId,
      updatedAt: '2026-08-06T00:00:00.000Z',
      attention: 'none' as const,
      lastActivity: {
        kind: 'conversation-updated' as const,
        occurredAt: '2026-08-06T00:00:00.000Z',
      },
    });
    first.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [
          homeConversation('conversation:invalid-owner'),
          homeConversation('conversation:valid-sibling'),
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    let projection = await first.service.getProjection(windowId);

    const settings = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'open-settings-before-invalid-session',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: { kind: 'open-settings' },
      }),
    );
    if (settings.status !== 'transitioned') throw new Error('Settings fixture is unavailable.');
    projection = await first.service.getProjection(windowId);

    const entry = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'open-entry-before-invalid-session',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: { kind: 'open-agent-entry' },
      }),
    );
    if (
      entry.status !== 'transitioned' ||
      entry.scene.context.kind !== 'agent' ||
      entry.scene.context.scope.kind !== 'unbound'
    ) {
      throw new Error('Entry Draft fixture is unavailable.');
    }
    projection = await first.service.getProjection(windowId);
    const bound = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'bind-invalid-assistant-session',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: { kind: 'bind-agent-assistant', draftId: entry.scene.context.scope.draftId },
      }),
    );
    if (bound.status !== 'transitioned' || bound.scene.context.kind !== 'agent') {
      throw new Error('Assistant fixture did not bind.');
    }
    await first.service.attachAgentConversation({
      windowId,
      rendererSessionId: projection.rendererSessionId,
      agentViewId: bound.scene.context.agentViewId,
      draftId: bound.scene.context.scope.draftId,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      conversationId: 'conversation:invalid-owner',
    });
    projection = await first.service.getProjection(windowId);
    const siblingEntry = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'open-valid-sibling-entry',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: { kind: 'open-agent-entry' },
      }),
    );
    if (
      siblingEntry.status !== 'transitioned' ||
      siblingEntry.scene.context.kind !== 'agent' ||
      siblingEntry.scene.context.scope.kind !== 'unbound'
    ) {
      throw new Error('Sibling Entry Draft fixture is unavailable.');
    }
    projection = await first.service.getProjection(windowId);
    const siblingBound = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'bind-valid-assistant-sibling',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: {
          kind: 'bind-agent-assistant',
          draftId: siblingEntry.scene.context.scope.draftId,
        },
      }),
    );
    if (siblingBound.status !== 'transitioned' || siblingBound.scene.context.kind !== 'agent') {
      throw new Error('Sibling Assistant fixture did not bind.');
    }
    await first.service.attachAgentConversation({
      windowId,
      rendererSessionId: projection.rendererSessionId,
      agentViewId: siblingBound.scene.context.agentViewId,
      draftId: siblingBound.scene.context.scope.draftId,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      conversationId: 'conversation:valid-sibling',
    });
    projection = await first.service.getProjection(windowId);
    await first.service.restoreAgentConversation({
      request: createDesktopSceneTransitionRequest({
        requestId: 'reactivate-invalid-session-before-restart',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: homeConversation('conversation:invalid-owner').navigation,
        },
      }),
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
    });
    const persisted = await first.service.getProjection(windowId);
    expect(activeScene(persisted.window).slots.interaction).toMatchObject({
      phase: 'session',
      scope: { conversationId: 'conversation:invalid-owner' },
    });
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const invalidAuthorityRecord = {
      workspaceId: 'assistant-space:local-user',
      conversationId: 'conversation:invalid-owner',
      context: {
        kind: 'workspace',
        workspaceId: 'assistant-space:local-user',
        workspaceGrantId: 'workspace-grant:invalid-owner',
      },
    } as const;
    const originalAuthorityBytes = JSON.stringify(invalidAuthorityRecord);
    const restored = createFixture(repository, 'restore');
    restored.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [homeConversation('conversation:valid-sibling')],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
        diagnostics: [
          {
            code: 'invalid-conversation-record',
            workspaceId: invalidAuthorityRecord.workspaceId,
            conversationId: invalidAuthorityRecord.conversationId,
            message:
              "Agent catalog Conversation 'conversation:invalid-owner' Workspace context resolves to an Assistant Space.",
          },
        ],
      }),
      subscribeHomeProjection: () => () => undefined,
    });

    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    const recovered = await restored.service.getProjection(restoredWindowId);
    const recoveredActive = activeInstance(recovered.window);

    expect(recoveredActive.scene).toMatchObject({
      context: { kind: 'agent', scope: { kind: 'assistant' } },
      slots: { interaction: { phase: 'draft', scope: { kind: 'assistant' } } },
    });
    expect(recoveredActive.scene.context).not.toHaveProperty(
      'scope.conversationId',
      'conversation:invalid-owner',
    );
    expect(recovered.agentHome.conversations).toEqual([
      expect.objectContaining({
        navigation: expect.objectContaining({ conversationId: 'conversation:valid-sibling' }),
      }),
    ]);
    expect(recovered.agentHome.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-conversation-record',
        conversationId: 'conversation:invalid-owner',
      }),
    ]);
    expect(JSON.stringify(invalidAuthorityRecord)).toBe(originalAuthorityBytes);
  });

  it('validates standalone Assistant lifecycle identity without requiring a Project', async () => {
    const fixture = createFixture();
    const navigation = {
      conversationId: 'conversation:assistant',
      owner: { kind: 'assistant' as const, assistantSpaceId: 'assistant-space:local-user' },
    };
    fixture.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [
          {
            navigation,
            title: 'Assistant conversation',
            updatedAt: '2026-08-04T00:00:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-08-04T00:00:00.000Z',
            },
          },
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);

    await expect(
      fixture.service.assertAgentHomeConversation(
        windowId,
        projection.rendererSessionId,
        navigation,
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.assertAgentHomeConversation(windowId, projection.rendererSessionId, {
        conversationId: navigation.conversationId,
        owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:other' },
      }),
    ).rejects.toMatchObject({
      code: 'desktop-shell-conversation-not-found',
    });
  });

  it('projects only fully composed Agent and Resource Browser capabilities as ready', async () => {
    const fixture = createFixture();
    fixture.service.setAgentCapabilityReady(true);
    fixture.service.setResourceBrowserCapabilityReady(true);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');

    const projection = await fixture.service.getProjection(windowId);

    expect(projection.domains.find((domain) => domain.surface === 'agent')).toEqual({
      surface: 'agent',
      status: 'ready',
      ownerSlice: 'P1.3',
    });
    expect(projection.domains.find((domain) => domain.surface === 'media-library')).toEqual({
      surface: 'media-library',
      status: 'ready',
      ownerSlice: 'P1.4',
    });
    expect(
      projection.domains
        .filter((domain) => domain.surface !== 'agent' && domain.surface !== 'media-library')
        .every((domain) => domain.status === 'unavailable'),
    ).toBe(true);
    expect(() => fixture.service.setAgentCapabilityReady(false)).toThrow(
      'before any Window is claimed',
    );
    expect(() => fixture.service.setResourceBrowserCapabilityReady(false)).toThrow(
      'before any Window is claimed',
    );
  });

  it('persists exact Scene transitions across renderer and application restart', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await first.service.getProjection(windowId);
    const initialScene = await first.service.getSceneProjection(windowId);

    const transitioned = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-1',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: initialScene.sceneId,
        intent: { kind: 'open-settings', sectionId: 'agent' },
      }),
    );

    expect(transitioned).toMatchObject({
      status: 'transitioned',
      scene: {
        context: { kind: 'settings', settingsSectionId: 'agent' },
        slots: {
          leftManager: { kind: 'settings-navigation', settingsSectionId: 'agent' },
          main: { kind: 'settings-main', settingsSectionId: 'agent' },
        },
      },
    });
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file, 'restore');
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    expect(await restored.service.getSceneProjection(restoredWindowId)).toMatchObject({
      sceneId: `scene:${windowId}:settings`,
      context: { kind: 'settings', settingsSectionId: 'agent' },
    });
  });

  it('allocates a fresh unbound draft for every Start Creating transition', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const initialContext = activeScene(initial.window).context;
    if (initialContext.kind !== 'agent') {
      throw new Error('Initial Scene must be an Agent Entry Draft.');
    }
    const initialDraftId = initialContext.scope.draftId;

    const first = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'start-creating-1',
        rendererSessionId: initial.rendererSessionId,
        windowId,
        sceneId: activeScene(initial.window).sceneId,
        intent: { kind: 'open-agent-entry' },
      }),
    );
    if (first.status !== 'transitioned' || first.scene.context.kind !== 'agent') {
      throw new Error('First Start Creating transition did not create an Agent draft.');
    }
    const afterFirst = await fixture.service.getProjection(windowId);
    const second = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'start-creating-2',
        rendererSessionId: afterFirst.rendererSessionId,
        windowId,
        sceneId: activeScene(afterFirst.window).sceneId,
        intent: { kind: 'open-agent-entry' },
      }),
    );
    if (second.status !== 'transitioned' || second.scene.context.kind !== 'agent') {
      throw new Error('Second Start Creating transition did not create an Agent draft.');
    }

    expect([
      initialDraftId,
      first.scene.context.scope.draftId,
      second.scene.context.scope.draftId,
    ]).toEqual([
      expect.stringMatching(/^draft:/u),
      expect.stringMatching(/^draft:/u),
      expect.stringMatching(/^draft:/u),
    ]);
    expect(
      new Set([
        initialDraftId,
        first.scene.context.scope.draftId,
        second.scene.context.scope.draftId,
      ]).size,
    ).toBe(3);
    expect(
      new Set([activeScene(initial.window).sceneId, first.scene.sceneId, second.scene.sceneId])
        .size,
    ).toBe(3);
    expect(second.scene).toMatchObject({
      context: { kind: 'agent', scope: { kind: 'unbound' } },
      slots: { interaction: { kind: 'agent', phase: 'draft', scope: { kind: 'unbound' } } },
    });
    expect((await fixture.service.getProjection(windowId)).agentHome.conversations).toEqual([]);
  });

  it('binds only the exact active Entry Draft to Assistant without creating a conversation', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const initialContext = activeScene(initial.window).context;
    if (initialContext.kind !== 'agent' || initialContext.scope.kind !== 'unbound') {
      throw new Error('Assistant binding fixture requires an unbound Entry Draft.');
    }
    const draftId = initialContext.scope.draftId;
    const bound = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'bind-assistant-1',
        rendererSessionId: initial.rendererSessionId,
        windowId,
        sceneId: activeScene(initial.window).sceneId,
        intent: { kind: 'bind-agent-assistant', draftId },
      }),
    );
    if (bound.status !== 'transitioned') throw new Error('Assistant draft did not bind.');
    expect(bound.scene).toMatchObject({
      context: {
        kind: 'agent',
        scope: { kind: 'assistant', draftId, assistantSpaceId: 'assistant-space:local-user' },
      },
      slots: { interaction: { phase: 'draft' } },
    });
    const afterBound = await fixture.service.getProjection(windowId);

    await expect(
      fixture.service.transitionScene(
        createDesktopSceneTransitionRequest({
          requestId: 'bind-assistant-stale',
          rendererSessionId: afterBound.rendererSessionId,
          windowId,
          sceneId: activeScene(afterBound.window).sceneId,
          intent: { kind: 'bind-agent-assistant', draftId },
        }),
      ),
    ).rejects.toMatchObject({ code: 'desktop-scene-stale-identity' });
    expect((await fixture.service.getProjection(windowId)).agentHome.conversations).toEqual([]);
  });

  it('rejects a stale Scene identity and returns owner-qualified unavailable without mutation', async () => {
    const fixture = createFixture(createMemoryFile(), 'home', undefined, false);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await fixture.service.getProjection(windowId);
    const scene = await fixture.service.getSceneProjection(windowId);
    const staleRequest = createDesktopSceneTransitionRequest({
      requestId: 'scene-request-stale',
      rendererSessionId: projection.rendererSessionId,
      windowId,
      sceneId: `${scene.sceneId}:stale`,
      intent: { kind: 'open-settings' },
    });

    await expect(fixture.service.transitionScene(staleRequest)).rejects.toMatchObject({
      code: 'desktop-scene-stale-identity',
    });

    const unavailable = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-workspace',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: scene.sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: 'grant-1' },
      }),
    );
    expect(unavailable).toEqual({
      status: 'unavailable',
      requestId: 'scene-request-workspace',
      diagnostic: {
        code: 'desktop-scene-owner-unavailable',
        severity: 'error',
        message: 'Workspace scene requires a validated Workspace authority grant.',
        metadata: { owner: 'workspace-authority', intentKind: 'open-workspace' },
      },
    });
    expect(await fixture.service.getSceneProjection(windowId)).toEqual(scene);
    expect(await fixture.service.getProjection(windowId)).toEqual(projection);
  });

  it('rejects an unavailable retained Project before Workspace restore', async () => {
    const retainedProject: DesktopProjectCatalogItem = {
      projectId: 'content:unavailable-workspace',
      workspaceId: 'unavailable-workspace',
      profile: 'content',
      displayName: 'Unavailable Project',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
      unavailable: {
        fieldNames: ['workspacePath'],
        message: 'The Project workspace is missing.',
      },
    };
    const fixture = createFixture(
      createMemoryFile(),
      'home',
      undefined,
      true,
      [],
      [retainedProject],
    );
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const before = await fixture.service.getProjection(windowId);

    await expect(
      fixture.service.transitionScene(
        createDesktopSceneTransitionRequest({
          requestId: 'open-unavailable-project',
          rendererSessionId: before.rendererSessionId,
          windowId,
          sceneId: activeScene(before.window).sceneId,
          intent: {
            kind: 'open-project-workspace',
            projectId: retainedProject.projectId,
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        message: expect.stringContaining('The Project workspace is missing.'),
        metadata: { owner: 'workspace-authority', intentKind: 'open-project-workspace' },
      },
    });
    expect(fixture.registry.restore).not.toHaveBeenCalled();
    expect(await fixture.service.getProjection(windowId)).toEqual(before);
  });

  it('preserves current retained unavailability over a persisted Project with the same identity', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const first = createFixture(repository);
    const firstWindowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(firstWindowId, 'renderer-session-1');
    const initial = await first.service.getProjection(firstWindowId);
    const opened = await openContent(
      first,
      firstWindowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const persistedProject = opened.projection.catalog.projects[0]!;
    first.service.releaseWindow(firstWindowId);
    await first.service.dispose();

    const retainedProject: DesktopProjectCatalogItem = {
      ...persistedProject,
      unavailable: {
        fieldNames: ['identity'],
        message: 'Project identity is missing.',
      },
    };
    const restored = createFixture(repository, 'restore', undefined, true, [], [retainedProject]);
    const windowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(windowId, 'renderer-session-1');
    const before = await restored.service.getProjection(windowId);
    expect(before.catalog.projects).toContainEqual(retainedProject);

    await expect(
      restored.service.transitionScene(
        createDesktopSceneTransitionRequest({
          requestId: 'open-persisted-unavailable-project',
          rendererSessionId: before.rendererSessionId,
          windowId,
          sceneId: activeScene(before.window).sceneId,
          intent: {
            kind: 'open-project-workspace',
            projectId: retainedProject.projectId,
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { message: expect.stringContaining('Project identity is missing.') },
    });
    expect(restored.registry.restore).not.toHaveBeenCalled();
  });

  it('rejects an unavailable Conversation before Scene mutation while a valid sibling remains', async () => {
    const fixture = createFixture();
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    fixture.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [
          {
            navigation: {
              conversationId: 'conversation-unavailable',
              owner: { kind: 'workspace', workspaceId },
            },
            title: 'Unavailable conversation',
            updatedAt: '2026-08-06T00:01:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-08-06T00:01:00.000Z',
            },
            unavailable: {
              fieldNames: ['context'],
              message: 'Conversation context is missing.',
            },
          },
          {
            navigation: {
              conversationId: 'conversation-valid',
              owner: { kind: 'workspace', workspaceId },
            },
            title: 'Valid conversation',
            updatedAt: '2026-08-06T00:00:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-08-06T00:00:00.000Z',
            },
          },
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const before = await fixture.service.getProjection(windowId);
    const request = createDesktopSceneTransitionRequest({
      requestId: 'restore-unavailable-conversation',
      rendererSessionId: before.rendererSessionId,
      windowId,
      sceneId: activeScene(before.window).sceneId,
      intent: {
        kind: 'restore-conversation',
        navigation: {
          conversationId: 'conversation-unavailable',
          owner: { kind: 'workspace', workspaceId },
        },
      },
    });

    await expect(
      fixture.service.restoreAgentConversation({
        request,
        context: {
          kind: 'workspace',
          workspaceId,
          workspaceGrantId: 'workspace-grant:unused',
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        message: 'Conversation context is missing.',
        metadata: { conversationOwnerKind: 'workspace' },
      },
    });
    expect(await fixture.service.getProjection(windowId)).toEqual(before);
    expect(before.agentHome.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          navigation: expect.objectContaining({ conversationId: 'conversation-valid' }),
        }),
      ]),
    );
  });

  it('resolves an opaque Workspace grant into an exact draft Scene without duplicating Project facts', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const authorityResolution: AssetWorkspaceResolution = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    };
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve: vi.fn(async () => authorityResolution) },
      createIdentity: () => 'grant-1',
    });
    const fixture = createFixture(repository, 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    let projection = await fixture.service.getProjection(windowId);
    await openContent(fixture, windowId, '/workspace/demo', projection.rendererSessionId);
    projection = await fixture.service.getProjection(windowId);
    const grant = authority.authorize({
      windowId,
      label: 'Demo',
      hostResource: '/workspace/demo',
    });

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-workspace',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: activeScene(projection.window).sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );

    expect(result).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'workspace',
            workspaceId: authorityResolution.workspaceId,
            workspaceGrantId: grant.workspaceGrantId,
          },
        },
        slots: {
          interaction: { kind: 'agent', phase: 'draft' },
          main: { kind: 'workspace-main', workspaceId: authorityResolution.workspaceId },
          rightManager: {
            kind: 'workspace-resources',
            workspaceId: authorityResolution.workspaceId,
          },
        },
      },
    });
    const committed = await fixture.service.getProjection(windowId);
    expect(committed.catalog.projects).toHaveLength(1);
    expect(committed.agentHome.conversations).toEqual([]);
  });

  it('keeps Workspace Scene refs atomic with Workbench updates and startup restoration', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const workspace: AssetWorkspaceResolution = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    };
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve: vi.fn(async () => workspace) },
      createIdentity: () => 'grant-1',
    });
    const first = createFixture(repository, 'home', authority);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(
      first,
      windowId,
      workspace.workspacePath,
      initial.rendererSessionId,
    );
    const grant = authority.authorize({
      windowId,
      label: workspace.displayName,
      hostResource: workspace.workspacePath,
    });
    await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-workspace-preview',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId,
        sceneId: activeScene(opened.projection.window).sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );
    const workspaceProjection = await first.service.getProjection(windowId);
    const current = activeWorkbench(workspaceProjection.window);
    const project = workspaceProjection.catalog.projects[0]!;
    const tab = workspaceProjection.window.tabs[0]!;
    const previewViewId = `preview:${tab.viewId}:temporary`;
    const updated = await first.service.updateWorkbench(
      windowId,
      workspaceProjection.rendererSessionId,
      activeInstance(workspaceProjection.window).workbenchInstanceId,
      {
        ...current,
        main: {
          views: [
            {
              viewId: previewViewId,
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: workspace.workspaceId,
              kind: 'preview',
              ownerId: 'preview-session:temporary-1',
              displayLabel: 'resource-1',
              documentId: 'resource-1',
              previewPresentation: 'temporary',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: [previewViewId],
              activeViewId: previewViewId,
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );

    expect(activeScene(updated.window).slots.main).toEqual({
      kind: 'workspace-main',
      workspaceId: workspace.workspaceId,
      viewId: previewViewId,
      viewInstanceId: tab.viewInstanceId,
    });
    first.service.setRendererSessionId(windowId, 'renderer-session-2');
    const reattached = await first.service.getProjection(windowId);
    expect(activeScene(reattached.window).slots.main).toMatchObject({
      viewId: previewViewId,
      viewInstanceId: tab.viewInstanceId,
    });
    expect(activeWorkbench(reattached.window).main.views[0]).toMatchObject({
      viewId: previewViewId,
      viewInstanceId: tab.viewInstanceId,
    });
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(repository, 'restore');
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    const restoredProjection = await restored.service.getProjection(restoredWindowId);
    const restoredMainView = activeWorkbench(restoredProjection.window).main.views[0]!;
    expect(restoredMainView).toMatchObject({
      kind: 'canvas',
      documentId: 'neko/boards/workspace.nkc',
    });
    expect(activeScene(restoredProjection.window).slots.main).toEqual({
      kind: 'workspace-main',
      workspaceId: workspace.workspaceId,
      viewId: restoredMainView.viewId,
      viewInstanceId: restoredMainView.viewInstanceId,
    });
  });

  it('opens a recent Project through its exact identity and a restored Workspace grant', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const workspace = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable' as const, value: '${HOME}/workspace/demo' },
    };
    const restore = vi.fn(async () => workspace);
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve: vi.fn(async () => workspace), restore },
      createIdentity: () => 'recent-project-grant',
    });
    const fixture = createFixture(repository, 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      workspace.workspacePath,
      initial.rendererSessionId,
    );
    const project = opened.projection.catalog.projects[0]!;
    const entry = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-recent-project-entry',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId,
        sceneId: activeScene(opened.projection.window).sceneId,
        intent: { kind: 'open-agent-entry' },
      }),
    );
    if (entry.status !== 'transitioned') {
      throw new Error('Recent Project fixture did not open an Entry Draft.');
    }
    const entryProjection = await fixture.service.getProjection(windowId);

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-recent-project',
        rendererSessionId: entryProjection.rendererSessionId,
        windowId,
        sceneId: activeScene(entryProjection.window).sceneId,
        intent: { kind: 'open-project-workspace', projectId: project.projectId },
      }),
    );

    expect(restore).toHaveBeenCalledWith(project.workspaceId);
    expect(result).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'workspace',
            workspaceId: project.workspaceId,
            workspaceGrantId: expect.stringMatching(/^workspace-grant:project:/u),
          },
        },
      },
    });
  });

  it('opens a requested Workspace as a fresh Draft from an active Agent session', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const workspace: AssetWorkspaceResolution = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    };
    const resolve = vi.fn(async () => workspace);
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve },
      createIdentity: () => 'grant-1',
    });
    const fixture = createFixture(repository, 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const grant = authority.authorize({
      windowId,
      label: workspace.displayName,
      hostResource: workspace.workspacePath,
    });
    const initial = await fixture.service.getProjection(windowId);
    const currentContext = activeScene(initial.window).context;
    if (currentContext.kind !== 'agent' || currentContext.scope.kind !== 'unbound') {
      throw new Error('Active Conversation rejection fixture requires an Entry Draft.');
    }
    const bound = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-assistant-fixture',
        rendererSessionId: initial.rendererSessionId,
        windowId,
        sceneId: activeScene(initial.window).sceneId,
        intent: { kind: 'bind-agent-assistant', draftId: currentContext.scope.draftId },
      }),
    );
    if (bound.status !== 'transitioned' || bound.scene.context.kind !== 'agent') {
      throw new Error('Active Conversation fixture did not bind Assistant scope.');
    }
    await fixture.service.attachAgentConversation({
      windowId,
      rendererSessionId: initial.rendererSessionId,
      agentViewId: bound.scene.context.agentViewId,
      draftId: bound.scene.context.scope.draftId,
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        baseGrantIds: [],
      },
      conversationId: 'conversation-1',
    });
    const projection = await fixture.service.getProjection(windowId);
    const scene = activeScene(projection.window);

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-rebind',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        sceneId: scene.sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );
    expect(result).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'workspace',
            workspaceId: workspace.workspaceId,
            workspaceGrantId: grant.workspaceGrantId,
          },
        },
        slots: {
          interaction: {
            kind: 'agent',
            phase: 'draft',
            scope: { kind: 'workspace' },
          },
        },
      },
    });
    if (
      result.status !== 'transitioned' ||
      result.scene.context.kind !== 'agent' ||
      result.scene.context.scope.kind !== 'workspace'
    ) {
      throw new Error('Workspace rebinding fixture did not create a Workspace Draft.');
    }
    expect(result.scene.context.scope).not.toHaveProperty('conversationId');
    expect(resolve).toHaveBeenCalledWith('/workspace/demo');
    expect(await fixture.service.getSceneProjection(windowId)).not.toEqual(scene);
  });

  it('commits an unbound Entry Draft directly into its exact Workspace session', async () => {
    const workspace: AssetWorkspaceResolution = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    };
    const resolve = vi.fn(async () => workspace);
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve },
      createIdentity: () => 'entry-workspace-grant',
    });
    const fixture = createFixture(undefined, 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const entryScene = activeScene(initial.window);
    if (entryScene.context.kind !== 'agent' || entryScene.context.scope.kind !== 'unbound') {
      throw new Error('Workspace first-submit fixture requires an unbound Entry Draft.');
    }
    const grant = authority.authorize({
      windowId,
      label: workspace.displayName,
      hostResource: workspace.workspacePath,
    });
    const input = {
      windowId,
      rendererSessionId: initial.rendererSessionId,
      agentViewId: entryScene.context.agentViewId,
      draftId: entryScene.context.scope.draftId,
      context: {
        kind: 'workspace' as const,
        workspaceId: workspace.workspaceId,
        workspaceGrantId: grant.workspaceGrantId,
      },
      conversationId: 'conversation:entry-workspace',
    };

    const attached = await fixture.service.attachAgentConversation(input);
    expect(attached).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'workspace',
          draftId: entryScene.context.scope.draftId,
          workspaceId: workspace.workspaceId,
          workspaceGrantId: grant.workspaceGrantId,
          conversationId: input.conversationId,
        },
      },
      slots: {
        interaction: { phase: 'session' },
        main: { kind: 'workspace-main', workspaceId: workspace.workspaceId },
        rightManager: { kind: 'workspace-resources', workspaceId: workspace.workspaceId },
      },
    });
    const committed = await fixture.service.getProjection(windowId);
    expect(committed.window.activeTarget).toMatchObject({ kind: 'project' });
    expect(committed.catalog.projects).toHaveLength(1);
    expect(committed.window.tabs).toHaveLength(1);
    expect(resolve).toHaveBeenCalledOnce();

    await expect(fixture.service.attachAgentConversation(input)).resolves.toEqual(attached);
    expect(resolve).toHaveBeenCalledOnce();
    await expect(
      fixture.service.attachAgentConversation({ ...input, draftId: 'draft:stale' }),
    ).rejects.toMatchObject({ code: 'desktop-scene-scope-mismatch' });
    expect(await fixture.service.getSceneProjection(windowId)).toEqual(attached);
  });

  it('treats the active Workspace Project Draft as an idempotent Scene transition', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const workspace = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable' as const, value: '${HOME}/workspace/demo' },
    };
    const restore = vi.fn(async () => workspace);
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve: vi.fn(async () => workspace), restore },
      createIdentity: () => 'project-grant',
    });
    const fixture = createFixture(repository, 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      workspace.workspacePath,
      initial.rendererSessionId,
    );
    const project = opened.projection.catalog.projects[0]!;
    const workspaceResult = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-open-project',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId,
        sceneId: activeScene(opened.projection.window).sceneId,
        intent: { kind: 'open-project-workspace', projectId: project.projectId },
      }),
    );
    if (workspaceResult.status !== 'transitioned') {
      throw new Error('Workspace Project fixture did not transition.');
    }
    const before = await fixture.service.getProjection(windowId);
    restore.mockClear();

    expect(before.window.activeTarget).toEqual({
      kind: 'project',
      tabId: before.window.tabs.find((candidate) => candidate.projectId === project.projectId)
        ?.tabId,
    });
    expect(activeScene(before.window).context).toMatchObject({
      kind: 'agent',
      scope: { kind: 'workspace', workspaceId: project.workspaceId },
    });

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-current-project',
        rendererSessionId: before.rendererSessionId,
        windowId,
        sceneId: activeScene(before.window).sceneId,
        intent: { kind: 'open-project-workspace', projectId: project.projectId },
      }),
    );

    expect(result).toEqual({
      status: 'transitioned',
      requestId: 'scene-request-current-project',
      scene: activeScene(before.window),
    });
    expect(restore).not.toHaveBeenCalled();
    expect(await fixture.service.getProjection(windowId)).toEqual(before);
  });

  it('opens the active Workspace Project session as a fresh Project Draft', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const workspace = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable' as const, value: '${HOME}/workspace/demo' },
    };
    const restore = vi.fn(async () => workspace);
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve: vi.fn(async () => workspace), restore },
      createIdentity: () => 'project-grant',
    });
    const fixture = createFixture(repository, 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      workspace.workspacePath,
      initial.rendererSessionId,
    );
    const project = opened.projection.catalog.projects[0]!;
    const workspaceResult = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-open-project-session-fixture',
        rendererSessionId: opened.projection.rendererSessionId,
        windowId,
        sceneId: activeScene(opened.projection.window).sceneId,
        intent: { kind: 'open-project-workspace', projectId: project.projectId },
      }),
    );
    if (workspaceResult.status !== 'transitioned') {
      throw new Error('Workspace Project session fixture did not transition.');
    }
    const state = await repository.read();
    const storedWindow = state.windows[0]!;
    const context = workspaceResult.scene.context;
    if (context.kind !== 'agent' || context.scope.kind !== 'workspace') {
      throw new Error('Workspace Project session fixture requires Workspace Agent scope.');
    }
    const scope = { ...context.scope, conversationId: 'conversation-1' };
    const sessionScene = parseDesktopWorkbenchSceneProjection({
      ...workspaceResult.scene,
      context: { ...context, scope },
      slots: {
        ...workspaceResult.scene.slots,
        interaction: {
          kind: 'agent',
          agentSurfaceId: workspaceResult.scene.slots.interaction!.agentSurfaceId,
          agentViewId: context.agentViewId,
          phase: 'session',
          scope,
        },
      },
    });
    await repository.commit({
      ...state,
      windows: [
        {
          ...storedWindow,
          workbench: createDesktopWindowComposition({
            workbenchInstanceId: activeInstance(storedWindow).workbenchInstanceId,
            layout: activeInstance(storedWindow).layout,
            scene: sessionScene,
          }),
        },
      ],
    });
    const before = await fixture.service.getProjection(windowId);
    const existingProjectTabs = before.window.tabs;
    const existingWorkbench = activeWorkbench(before.window);
    restore.mockClear();

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-current-project-session',
        rendererSessionId: before.rendererSessionId,
        windowId,
        sceneId: sessionScene.sceneId,
        intent: { kind: 'open-project-workspace', projectId: project.projectId },
      }),
    );

    expect(result).toMatchObject({
      status: 'transitioned',
      requestId: 'scene-request-current-project-session',
      scene: {
        context: {
          kind: 'agent',
          scope: {
            kind: 'workspace',
            workspaceId: project.workspaceId,
          },
        },
        slots: {
          interaction: {
            kind: 'agent',
            phase: 'draft',
            scope: { kind: 'workspace' },
          },
        },
      },
    });
    if (
      result.status !== 'transitioned' ||
      result.scene.context.kind !== 'agent' ||
      result.scene.context.scope.kind !== 'workspace'
    ) {
      throw new Error('Workspace Project fixture did not create a fresh Draft.');
    }
    expect(result.scene.context.scope).not.toHaveProperty('conversationId');
    expect(restore).toHaveBeenCalledWith(project.workspaceId);
    const draftProjection = await fixture.service.getProjection(windowId);
    expect(draftProjection.window.tabs).toEqual(existingProjectTabs);
    expect(activeWorkbench(draftProjection.window)).toEqual(existingWorkbench);
    expect(activeScene(draftProjection.window)).not.toEqual(sessionScene);

    const attached = await fixture.service.attachAgentConversation({
      windowId,
      rendererSessionId: draftProjection.rendererSessionId,
      agentViewId: result.scene.context.agentViewId,
      draftId: result.scene.context.scope.draftId,
      context: {
        kind: 'workspace',
        workspaceId: project.workspaceId,
        workspaceGrantId: result.scene.context.scope.workspaceGrantId,
      },
      conversationId: 'conversation-2',
    });
    const sessionProjection = await fixture.service.getProjection(windowId);
    expect(attached).toMatchObject({
      context: { scope: { conversationId: 'conversation-2' } },
      slots: { interaction: { phase: 'session' } },
    });
    expect(sessionProjection.window.tabs).toEqual(existingProjectTabs);
    expect(activeWorkbench(sessionProjection.window)).toEqual(existingWorkbench);
  });

  it('persists Sidebar state independently and rejects another renderer session', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const projection = await first.service.getProjection(windowId);

    const updated = await first.service.updateApplicationSidebar(
      createDesktopApplicationSidebarMutationRequest({
        requestId: 'sidebar-request-1',
        rendererSessionId: projection.rendererSessionId,
        windowId,
        visible: false,
        width: 304,
      }),
    );

    expect(updated.window.applicationSidebar).toMatchObject({
      visible: false,
      width: 304,
    });
    const after = await first.service.getProjection(windowId);
    expect(activeWorkbench(after.window)).toEqual(activeWorkbench(projection.window));
    await expect(
      first.service.updateApplicationSidebar(
        createDesktopApplicationSidebarMutationRequest({
          requestId: 'sidebar-request-other-renderer',
          rendererSessionId: 'renderer-session-other',
          windowId,
          visible: true,
          width: 240,
        }),
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-request-mismatch' });

    first.service.releaseWindow(windowId);
    await first.service.dispose();
    const restored = createFixture(file, 'restore');
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    expect(await restored.service.getApplicationSidebarProjection(restoredWindowId)).toMatchObject({
      visible: false,
      width: 304,
    });
  });

  it('reuses one Project and focuses one Tab for duplicate opens', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);

    const first = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const second = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      first.projection.rendererSessionId,
    );

    expect(first.projection.catalog.projects).toHaveLength(1);
    expect(second.projection.catalog.projects).toHaveLength(1);
    expect(second.projection.window.tabs).toHaveLength(1);
    expect(second.projection.window.tabs).toEqual(first.projection.window.tabs);
    expect(first.workspace).toEqual(second.workspace);
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(3);
  });

  it('opens the canonical Workspace Canvas when a Project has no stored Main View', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);

    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );

    expect(activeWorkbench(opened.projection.window)).toMatchObject({
      display: { mode: 'chat-main' },
      main: {
        views: [
          {
            projectId: 'content:11111111-1111-4111-8111-111111111111',
            workspaceId: '11111111-1111-4111-8111-111111111111',
            kind: 'canvas',
            documentId: 'neko/boards/workspace.nkc',
          },
        ],
      },
    });
    expect(activeWorkbench(opened.projection.window).main.groups[0]).toMatchObject({
      viewIds: [activeWorkbench(opened.projection.window).main.views[0]?.viewId],
      activeViewId: activeWorkbench(opened.projection.window).main.views[0]?.viewId,
    });
  });

  it('restores the canonical Workspace Canvas before projecting an active Project with an empty Main group', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const current = activeWorkbench(opened.projection.window);
    const canvasView = current.main.views[0];
    if (!canvasView) throw new Error('Expected the default Workspace Canvas View.');
    await first.service.updateWorkbench(
      windowId,
      opened.projection.rendererSessionId,
      activeInstance(opened.projection.window).workbenchInstanceId,
      closeMainView(current, canvasView.viewId),
    );
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file, 'restore');
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindow, 'renderer-session-1');
    const projection = await restored.service.getProjection(restoredWindow);

    expect(projection.window.activeTarget.kind).toBe('project');
    expect(activeWorkbench(projection.window).main.views).toEqual([
      expect.objectContaining({
        kind: 'canvas',
        documentId: 'neko/boards/workspace.nkc',
      }),
    ]);
    expect(activeWorkbench(projection.window).main.groups[0]).toMatchObject({
      viewIds: [activeWorkbench(projection.window).main.views[0]?.viewId],
      activeViewId: activeWorkbench(projection.window).main.views[0]?.viewId,
    });
  });

  it('keeps the Workspace Agent Scene active when its last Main View closes', async () => {
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: {
        resolve: vi.fn(async () => ({
          workspaceId: '11111111-1111-4111-8111-111111111111',
          workspacePath: '/workspace/demo',
          displayName: 'Demo',
          locator: { kind: 'variable' as const, value: '${HOME}/workspace/demo' },
        })),
      },
      createIdentity: () => 'grant-live-workspace',
    });
    const fixture = createFixture(createMemoryFile(), 'home', authority);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const grant = authority.authorize({
      windowId,
      label: 'Demo',
      hostResource: '/workspace/demo',
    });
    await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'activate-live-workspace',
        rendererSessionId: initial.rendererSessionId,
        windowId,
        sceneId: activeScene(initial.window).sceneId,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );
    const active = await fixture.service.getProjection(windowId);
    const mainView = activeWorkbench(active.window).main.views[0];
    if (!mainView) throw new Error('Expected the canonical Workspace Main View.');

    const closed = await fixture.service.updateWorkbench(
      windowId,
      active.rendererSessionId,
      activeInstance(active.window).workbenchInstanceId,
      closeMainView(activeWorkbench(active.window), mainView.viewId),
    );

    expect(activeWorkbench(closed.window).main).toMatchObject({
      views: [],
      groups: [{ groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, viewIds: [] }],
    });
    expect(activeScene(closed.window)).toMatchObject({
      context: {
        kind: 'agent',
        scope: {
          kind: 'workspace',
          workspaceId: '11111111-1111-4111-8111-111111111111',
        },
      },
      slots: {
        interaction: { kind: 'agent', phase: 'draft' },
        rightManager: { kind: 'workspace-resources' },
      },
    });
    expect(activeScene(closed.window).slots.main).toBeUndefined();
    expect(activeScene(closed.window).slots.timeline).toBeUndefined();

    fixture.service.setRendererSessionId(windowId, 'renderer-session-2');
    const reattached = await fixture.service.getProjection(windowId);
    expect(activeScene(reattached.window).slots.main).toBeUndefined();
    expect(activeScene(reattached.window).slots.interaction).toMatchObject({
      kind: 'agent',
      phase: 'draft',
    });
  });

  it('restores a Workspace conversation with its Project target, Workbench and Agent phase together', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const project = opened.projection.catalog.projects[0];
    const tab = opened.projection.window.tabs[0];
    if (!project || !tab) throw new Error('Expected the persisted Workspace Project and Tab.');
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file, 'home');
    restored.service.setAgentHomeProjectionSource({
      readHomeProjection: () => ({
        conversations: [
          {
            navigation: {
              conversationId: 'conversation-workspace-1',
              owner: { kind: 'workspace', workspaceId: project.workspaceId },
            },
            title: 'Workspace conversation',
            updatedAt: '2026-08-04T00:00:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-08-04T00:00:00.000Z',
            },
          },
          {
            navigation: {
              conversationId: 'conversation-workspace-2',
              owner: { kind: 'workspace', workspaceId: project.workspaceId },
            },
            title: 'Second Workspace conversation',
            updatedAt: '2026-08-04T00:01:00.000Z',
            attention: 'none',
            lastActivity: {
              kind: 'conversation-updated',
              occurredAt: '2026-08-04T00:01:00.000Z',
            },
          },
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    const entry = await restored.service.getProjection(restoredWindowId);
    expect(entry.window.activeTarget).toEqual({ kind: 'home' });

    const result = await restored.service.restoreAgentConversation({
      request: createDesktopSceneTransitionRequest({
        requestId: 'restore-workspace-conversation-atomically',
        rendererSessionId: entry.rendererSessionId,
        windowId: restoredWindowId,
        sceneId: activeScene(entry.window).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: 'conversation-workspace-1',
            owner: { kind: 'workspace', workspaceId: project.workspaceId },
          },
        },
      }),
      context: {
        kind: 'workspace',
        workspaceId: project.workspaceId,
        workspaceGrantId: 'workspace-grant:conversation-workspace-1',
      },
    });

    expect(result).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          kind: 'agent',
          scope: { kind: 'workspace', conversationId: 'conversation-workspace-1' },
        },
        slots: { interaction: { kind: 'agent', phase: 'session' } },
      },
    });
    if (result.status !== 'transitioned') throw new Error('Expected Workspace restore.');
    const committed = await restored.service.getProjection(restoredWindowId);
    expect(committed.window.activeTarget).toEqual({ kind: 'project', tabId: tab.tabId });
    expect(activeWorkbench(committed.window).main.views).toEqual([
      expect.objectContaining({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
      }),
    ]);
    expect(activeScene(committed.window)).toEqual(result.scene);

    const existingWorkbench = activeWorkbench(committed.window);
    const second = await restored.service.restoreAgentConversation({
      request: createDesktopSceneTransitionRequest({
        requestId: 'restore-second-workspace-conversation-in-existing-workbench',
        rendererSessionId: committed.rendererSessionId,
        windowId: restoredWindowId,
        sceneId: activeScene(committed.window).sceneId,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: 'conversation-workspace-2',
            owner: { kind: 'workspace', workspaceId: project.workspaceId },
          },
        },
      }),
      context: {
        kind: 'workspace',
        workspaceId: project.workspaceId,
        workspaceGrantId: 'workspace-grant:conversation-workspace-2',
      },
    });
    const afterSecond = await restored.service.getProjection(restoredWindowId);
    expect(second).toMatchObject({
      status: 'transitioned',
      scene: {
        context: {
          scope: { conversationId: 'conversation-workspace-2' },
        },
      },
    });
    expect(afterSecond.window.tabs).toEqual(committed.window.tabs);
    expect(activeWorkbench(afterSecond.window)).toEqual(existingWorkbench);
  });

  it('shares a Project owner while isolating cross-window Tab and View identity', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(firstWindow, 'renderer-session-1');
    fixture.service.setRendererSessionId(secondWindow, 'renderer-session-1');
    const firstEvents = vi.fn();
    const secondEvents = vi.fn();
    fixture.service.subscribe(firstWindow, firstEvents);
    fixture.service.subscribe(secondWindow, secondEvents);
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);

    const first = await openContent(
      fixture,
      firstWindow,
      '/workspace/demo',
      firstInitial.rendererSessionId,
    );
    const second = await openContent(
      fixture,
      secondWindow,
      '/workspace/demo',
      secondInitial.rendererSessionId,
    );

    expect(first.projection.catalog.projects[0]?.projectId).toBe(
      second.projection.catalog.projects[0]?.projectId,
    );
    expect(first.projection.window.tabs[0]?.tabId).not.toBe(
      second.projection.window.tabs[0]?.tabId,
    );
    expect(first.projection.window.tabs[0]?.viewId).not.toBe(
      second.projection.window.tabs[0]?.viewId,
    );
    expect(firstEvents).toHaveBeenCalled();
    expect(secondEvents).toHaveBeenCalled();
  });

  it('deletes Projects and all of their cross-window Tabs without deleting workspace files', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(firstWindow, 'renderer-session-1');
    fixture.service.setRendererSessionId(secondWindow, 'renderer-session-1');
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);
    const firstOpened = await openContent(
      fixture,
      firstWindow,
      '/workspace/demo',
      firstInitial.rendererSessionId,
    );
    await openContent(fixture, secondWindow, '/workspace/demo', secondInitial.rendererSessionId);
    const project = firstOpened.projection.catalog.projects[0]!;

    const removed = await fixture.service.removeProjectsFromCatalog(
      firstWindow,
      [project.projectId],
      firstOpened.projection.rendererSessionId,
    );
    const secondProjection = await fixture.service.getProjection(secondWindow);

    expect(removed.projection.catalog.projects).toEqual([]);
    expect(removed.projection.window).toMatchObject({
      activeTarget: { kind: 'home' },
      tabs: [],
    });
    expect(secondProjection.window).toMatchObject({
      activeTarget: { kind: 'home' },
      tabs: [],
    });
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(3);
  });

  it('removes the Project-owned Workbench Views while Home is active', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const project = opened.projection.catalog.projects[0]!;
    const tab = opened.projection.window.tabs[0]!;
    const current = activeWorkbench(opened.projection.window);
    const withCanvas = await first.service.updateWorkbench(
      windowId,
      opened.projection.rendererSessionId,
      activeInstance(opened.projection.window).workbenchInstanceId,
      {
        ...current,
        main: {
          views: [
            {
              viewId: 'canvas:view-1:main',
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'canvas',
              ownerId: 'canvas:project-1',
              displayLabel: 'main.nkc',
              documentId: 'boards/main.nkc',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: ['canvas:view-1:main'],
              activeViewId: 'canvas:view-1:main',
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );
    const home = await first.service.activateHome(windowId, withCanvas.rendererSessionId);

    const removed = await first.service.removeProjectsFromCatalog(
      windowId,
      [project.projectId],
      home.rendererSessionId,
    );

    expect(activeWorkbench(removed.projection.window).main.views).toEqual([]);
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindowId, 'renderer-session-1');
    await expect(restored.service.getProjection(restoredWindowId)).resolves.toMatchObject({
      catalog: { projects: [] },
      window: {
        activeTarget: { kind: 'home' },
        workbench: {
          layout: expect.objectContaining({
            main: expect.objectContaining({ views: [] }),
          }),
        },
      },
    });
  });

  it('rejects an unknown Project removal without changing Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const project = opened.projection.catalog.projects[0]!;

    await expect(
      fixture.service.removeProjectsFromCatalog(
        windowId,
        [project.projectId, `${project.projectId}:missing`],
        opened.projection.rendererSessionId,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-project-not-found' });

    expect(await fixture.service.getProjection(windowId)).toEqual(opened.projection);
    expect(fixture.registry.removeProjects).not.toHaveBeenCalled();
  });

  it('rejects closing an unavailable Tab identity without changing state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const tabId = opened.projection.window.tabs[0]!.tabId;
    await fixture.service.closeTab(windowId, tabId, opened.projection.rendererSessionId);

    await expect(
      fixture.service.closeTab(windowId, tabId, opened.projection.rendererSessionId),
    ).rejects.toThrow(`Unknown Desktop Project Tab '${tabId}'`);
    expect((await fixture.service.getProjection(windowId)).window.tabs).toEqual([]);
  });

  it('returns unavailable profiles without persisting Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const before = await fixture.service.getProjection(windowId);

    const result = await fixture.service.requestUnavailableProfile(windowId, 'request-1', 'world');
    const after = await fixture.service.getProjection(windowId);

    expect(result.diagnostic.code).toBe('desktop-project-profile-unavailable');
    expect(after).toEqual(before);
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('restores the primary Window layout with a new renderer session after restart', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const firstWindow = await first.service.claimWindowId();
    first.service.setRendererSessionId(firstWindow, 'renderer-session-1');
    const initial = await first.service.getProjection(firstWindow);
    await openContent(first, firstWindow, '/workspace/demo', initial.rendererSessionId);
    first.service.releaseWindow(firstWindow);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindow = await second.service.claimWindowId();
    second.service.setRendererSessionId(restoredWindow, 'renderer-session-restored');
    const restored = await second.service.getProjection(restoredWindow);

    expect(restoredWindow).toBe(firstWindow);
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.rendererSessionId).toBe('renderer-session-restored');
    expect(restored.rendererSessionId).not.toBe(initial.rendererSessionId);
  });

  it('persists Workbench layout through the serialized Shell owner', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const current = activeWorkbench(opened.projection.window);
    const next = {
      ...current,
      resourceDock: {
        ...current.resourceDock,
        presentation: 'overlay' as const,
      },
    };

    const updated = await first.service.updateWorkbench(
      windowId,
      opened.projection.rendererSessionId,
      activeInstance(opened.projection.window).workbenchInstanceId,
      next,
    );

    expect(activeWorkbench(updated.window)).toMatchObject({
      resourceDock: { presentation: 'overlay' },
    });

    first.service.releaseWindow(windowId);
    await first.service.dispose();
    const restored = createFixture(file);
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindow, 'renderer-session-1');

    expect(
      activeWorkbench((await restored.service.getProjection(restoredWindow)).window),
    ).toMatchObject({
      resourceDock: { presentation: 'overlay' },
    });
  });

  it('preserves the visible Project Resource Dock when the same Project reattaches', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const current = activeWorkbench(opened.projection.window);
    const withResources = await fixture.service.updateWorkbench(
      windowId,
      opened.projection.rendererSessionId,
      activeInstance(opened.projection.window).workbenchInstanceId,
      {
        ...current,
        resourceDock: { presentation: 'docked', width: 412 },
      },
    );

    const reattached = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      withResources.rendererSessionId,
    );

    expect(activeWorkbench(reattached.projection.window).resourceDock).toEqual({
      presentation: 'docked',
      width: 412,
    });
  });

  it('restores each Project presentation after exact Workspace switching', async () => {
    const fixture = createFixture();
    const firstWorkspace: AssetWorkspaceResolution = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath: '/workspace/first',
      displayName: 'First',
      locator: { kind: 'variable', value: '${HOME}/workspace/first' },
    };
    const secondWorkspace: AssetWorkspaceResolution = {
      workspaceId: '22222222-2222-4222-8222-222222222222',
      workspacePath: '/workspace/second',
      displayName: 'Second',
      locator: { kind: 'variable', value: '${HOME}/workspace/second' },
    };
    const workspaces = new Map(
      [firstWorkspace, secondWorkspace].map((workspace) => [workspace.workspacePath, workspace]),
    );
    fixture.registry.resolve.mockImplementation(async (workspacePath: string) => {
      const workspace = workspaces.get(workspacePath);
      if (!workspace) throw new Error(`Unknown fixture Workspace '${workspacePath}'.`);
      return workspace;
    });

    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const firstOpened = await openContent(
      fixture,
      windowId,
      firstWorkspace.workspacePath,
      initial.rendererSessionId,
    );
    const firstProject = firstOpened.projection.catalog.projects.find(
      (project) => project.workspaceId === firstWorkspace.workspaceId,
    );
    const firstTab = firstOpened.projection.window.tabs.find(
      (tab) => tab.projectId === firstProject?.projectId,
    );
    if (!firstProject || !firstTab) throw new Error('First fixture Project is unavailable.');
    const previewViewId = 'preview:first-workspace:temporary';
    const previewWorkbench = {
      ...activeWorkbench(firstOpened.projection.window),
      main: {
        views: [
          {
            viewId: previewViewId,
            viewInstanceId: firstTab.viewInstanceId,
            projectId: firstProject.projectId,
            workspaceId: firstWorkspace.workspaceId,
            kind: 'preview' as const,
            ownerId: 'preview-session:first-workspace',
            displayLabel: 'preview.png',
            documentId: 'preview.png',
            previewPresentation: 'temporary' as const,
          },
        ],
        groups: [
          {
            groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
            viewIds: [previewViewId],
            activeViewId: previewViewId,
          },
        ],
        activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
      },
    };
    const withPreview = await fixture.service.updateWorkbench(
      windowId,
      firstOpened.projection.rendererSessionId,
      activeInstance(firstOpened.projection.window).workbenchInstanceId,
      previewWorkbench,
    );

    const secondOpened = await openContent(
      fixture,
      windowId,
      secondWorkspace.workspacePath,
      withPreview.rendererSessionId,
    );
    expect(activeWorkbench(secondOpened.projection.window).main.views).toEqual([
      expect.objectContaining({
        kind: 'canvas',
        workspaceId: secondWorkspace.workspaceId,
      }),
    ]);

    const restored = await fixture.service.openCatalogProject(
      windowId,
      firstProject.projectId,
      secondOpened.projection.rendererSessionId,
    );

    expect(activeWorkbench(restored.projection.window)).toEqual(previewWorkbench);
    expect(activeWorkbench(restored.projection.window).main).toEqual({
      views: [
        expect.objectContaining({ viewId: previewViewId, workspaceId: firstWorkspace.workspaceId }),
      ],
      groups: [
        {
          groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
          viewIds: [previewViewId],
          activeViewId: previewViewId,
        },
      ],
      activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
    });
    expect(restored.projection.window.tabs).toHaveLength(2);
    for (const tab of restored.projection.window.tabs) {
      expect(tab).not.toHaveProperty('presentation');
    }
  });

  it('rejects Workbench updates while no Project is active', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    await fixture.service.activateHome(windowId, opened.projection.rendererSessionId);
    fixture.service.setRendererSessionId(windowId, 'renderer-session-2');
    const reattachedHome = await fixture.service.getProjection(windowId);
    const current = activeWorkbench(reattachedHome.window);
    await expect(
      fixture.service.updateWorkbench(
        windowId,
        reattachedHome.rendererSessionId,
        activeInstance(reattachedHome.window).workbenchInstanceId,
        {
          ...current,
          resourceDock: {
            ...current.resourceDock,
            presentation: 'overlay',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'desktop-shell-project-identity-mismatch',
      message: 'Desktop Workbench mutation requires an active Project attachment.',
    });
    expect(await fixture.service.getApplicationSidebarProjection(windowId)).toEqual(
      reattachedHome.window.applicationSidebar,
    );
  });

  it('drops a persisted temporary Preview View and restores the default Workspace Canvas', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const current = activeWorkbench(opened.projection.window);
    await first.service.updateWorkbench(
      windowId,
      opened.projection.rendererSessionId,
      activeInstance(opened.projection.window).workbenchInstanceId,
      {
        ...current,
        main: {
          views: [
            {
              viewId: 'preview:view-1',
              viewInstanceId: opened.projection.window.tabs[0]!.viewInstanceId,
              projectId: opened.projection.catalog.projects[0]!.projectId,
              workspaceId: opened.workspace.workspaceId,
              kind: 'preview',
              ownerId: 'preview-session:temporary-1',
              displayLabel: 'resource-1',
              documentId: 'resource-1',
              previewPresentation: 'temporary',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: ['preview:view-1'],
              activeViewId: 'preview:view-1',
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file, 'restore');
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindow, 'renderer-session-1');
    const projection = await restored.service.getProjection(restoredWindow);

    expect(projection.window.activeTarget.kind).toBe('project');
    expect(activeWorkbench(projection.window)).toMatchObject({
      display: { mode: 'chat-main' },
      main: {
        views: [
          {
            kind: 'canvas',
            documentId: 'neko/boards/workspace.nkc',
          },
        ],
        groups: [
          {
            groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
            viewIds: [expect.stringContaining('canvas:')],
          },
        ],
      },
    });
  });

  it('persists only the bounded presentation identity for a pinned Preview View', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const current = activeWorkbench(opened.projection.window);
    const tab = opened.projection.window.tabs[0]!;
    const project = opened.projection.catalog.projects[0]!;
    await first.service.updateWorkbench(
      windowId,
      opened.projection.rendererSessionId,
      activeInstance(opened.projection.window).workbenchInstanceId,
      {
        ...current,
        main: {
          views: [
            {
              viewId: 'preview:view-1:pinned',
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: opened.workspace.workspaceId,
              kind: 'preview',
              ownerId: 'preview-session:pinned-1',
              displayLabel: 'resource-1',
              documentId: 'resource-1',
              previewPresentation: 'pinned',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: ['preview:view-1:pinned'],
              activeViewId: 'preview:view-1:pinned',
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererSessionId(restoredWindow, 'renderer-session-1');
    const projection = await restored.service.getProjection(restoredWindow);

    expect(activeWorkbench(projection.window).main.views).toEqual([
      expect.objectContaining({
        viewId: 'preview:view-1:pinned',
        ownerId: 'preview-session:pinned-1',
        documentId: 'resource-1',
        previewPresentation: 'pinned',
      }),
    ]);
    expect(JSON.stringify(activeWorkbench(projection.window))).not.toMatch(
      /descriptor|absolutePath|neko-media:/u,
    );
  });

  it('resolves a restored Agent workspace through the Host-only persisted locator', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await first.service.getProjection(windowId);
    const opened = await openContent(first, windowId, '/workspace/demo', initial.rendererSessionId);
    const workspaceId = opened.workspace.workspaceId;
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const resolution = await restored.service.resolveAgentWorkspace(workspaceId);

    expect(resolution.workspaceId).toBe(workspaceId);
    expect(restored.registry.resolve).toHaveBeenCalledWith('/workspace/demo');
  });

  it('rejects a mutation from a replaced renderer endpoint before workspace resolution', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const stale = await fixture.service.getProjection(windowId);
    fixture.service.setRendererSessionId(windowId, 'renderer-session-2');

    await expect(
      fixture.service.openContent(windowId, '/workspace/demo', stale.rendererSessionId),
    ).rejects.toMatchObject({ code: 'desktop-shell-request-mismatch' });
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('keeps persisted View identity stable when a renderer reattaches', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const firstView = opened.projection.window.tabs[0];
    fixture.service.setRendererSessionId(windowId, 'renderer-session-2');
    const reattached = await fixture.service.getProjection(windowId);

    expect(reattached.window.tabs[0]).toMatchObject({
      viewId: firstView?.viewId,
      viewInstanceId: firstView?.viewInstanceId,
    });
    expect(firstView?.viewInstanceId).not.toHaveLength(0);
    expect(reattached.rendererSessionId).not.toBe(opened.projection.rendererSessionId);
  });

  it('reopens a closed catalog Project with a new View identity', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const firstTab = opened.projection.window.tabs[0]!;
    const closed = await fixture.service.closeTab(
      windowId,
      firstTab.tabId,
      opened.projection.rendererSessionId,
    );
    const reopened = await fixture.service.openCatalogProject(
      windowId,
      opened.projection.catalog.projects[0]!.projectId,
      closed.rendererSessionId,
    );

    expect(reopened.projection.window.tabs[0]?.viewId).not.toBe(firstTab.viewId);
    expect(reopened.projection.window.tabs[0]?.viewInstanceId).not.toBe(firstTab.viewInstanceId);
  });

  it('authorizes a new Cut target from the sender-bound active Project before attaching its View', async () => {
    const fixture = createFixture();
    fixture.service.setCutCapabilityReady(true);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererSessionId(windowId, 'renderer-session-1');
    const initial = await fixture.service.getProjection(windowId);
    const opened = await openContent(
      fixture,
      windowId,
      '/workspace/demo',
      initial.rendererSessionId,
    );
    const project = opened.projection.catalog.projects[0];
    const tab = opened.projection.window.tabs[0];
    if (!project || !tab) throw new Error('Cut creation fixture Project is unavailable.');
    const identity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      viewId: 'cut:new-target',
      viewInstanceId: tab.viewInstanceId,
      documentId: 'edits/new-target.otio',
      sessionId: createCutHostSessionId('cut:new-target', tab.viewInstanceId),
      rendererSessionId: opened.projection.rendererSessionId,
    };

    await expect(fixture.service.resolveCutCreationGrant(windowId, identity)).resolves.toEqual({
      identity,
      workspace: opened.workspace,
    });
    await expect(
      fixture.service.resolveCutCreationGrant(windowId, {
        ...identity,
        workspaceId: 'another-workspace',
      }),
    ).rejects.toThrow('not granted by the active Project');
  });
});

function createFixture(
  repository = createInMemoryDesktopShellStateRepository(),
  startupTarget: 'home' | 'restore' = 'home',
  workspaceGrantAuthority?: DesktopWorkspaceGrantAuthority,
  workspaceAuthorityEnabled = true,
  startupStateDiagnostics: readonly DesktopShellStateDiagnosticProjection[] = [],
  retainedProjects: readonly DesktopProjectCatalogItem[] = [],
) {
  let identity = 0;
  const resolution: AssetWorkspaceResolution = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath: '/workspace/demo',
    displayName: 'Demo',
    locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
  };
  const restoreWorkspace = vi.fn(
    async (_workspaceId: string): Promise<AssetWorkspaceResolution> => resolution,
  );
  const registry: DesktopWorkspaceResolutionPort & {
    readonly resolve: ReturnType<typeof vi.fn>;
    readonly restore: typeof restoreWorkspace;
    readonly removeProjects: ReturnType<typeof vi.fn>;
  } = {
    resolve: vi.fn(async () => resolution),
    restore: restoreWorkspace,
    removeProjects: vi.fn(async () => true),
    dispose: vi.fn(async () => undefined),
  };
  const authority =
    workspaceGrantAuthority ??
    new DesktopWorkspaceGrantAuthority({
      resolver: registry,
      createIdentity: () => `fixture-grant-${identity + 1}`,
    });
  const applicationInstanceId = repository.applicationCount === 0 ? 'app-1' : 'app-2';
  repository.applicationCount += 1;
  return {
    authority,
    registry,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: repository,
      workspaceRegistry: registry,
      workspaceGrantAuthority: workspaceAuthorityEnabled ? authority : undefined,
      startupTarget,
      startupStateDiagnostics,
      retainedProjects,
      createIdentity: () => `identity-${(identity += 1)}`,
      now: () => '2026-07-27T00:00:00.000Z',
    }),
  };
}

async function openContent(
  fixture: ReturnType<typeof createFixture>,
  windowId: string,
  workspacePath: string,
  rendererSessionId: string,
) {
  const current = await fixture.service.getProjection(windowId);
  if (current.rendererSessionId !== rendererSessionId) {
    throw new Error('Desktop test Workspace open context is stale.');
  }
  const workspace = await fixture.registry.resolve(workspacePath);
  const existingProject = current.catalog.projects.find(
    (project) => project.workspaceId === workspace.workspaceId,
  );
  const intent = existingProject
    ? { kind: 'open-project-workspace' as const, projectId: existingProject.projectId }
    : {
        kind: 'open-workspace' as const,
        workspaceGrantId: fixture.authority.authorize({
          windowId,
          label: workspace.displayName,
          hostResource: workspacePath,
        }).workspaceGrantId,
      };
  const result = await fixture.service.transitionScene(
    createDesktopSceneTransitionRequest({
      requestId: `test-open-workspace:${workspace.workspaceId}:${rendererSessionId}`,
      rendererSessionId,
      windowId,
      sceneId: activeScene(current.window).sceneId,
      intent,
    }),
  );
  if (result.status !== 'transitioned') {
    throw new Error('Desktop test Workspace transition is unavailable.');
  }
  return { projection: await fixture.service.getProjection(windowId), workspace };
}

function workspaceHomeConversation(conversationId: string, workspaceId: string) {
  return {
    navigation: {
      conversationId,
      owner: { kind: 'workspace' as const, workspaceId },
    },
    title: conversationId,
    updatedAt: '2026-08-06T00:00:00.000Z',
    attention: 'none' as const,
    lastActivity: {
      kind: 'conversation-updated' as const,
      occurredAt: '2026-08-06T00:00:00.000Z',
    },
  };
}

function createMemoryFile(): InMemoryDesktopShellStateRepository {
  return createInMemoryDesktopShellStateRepository();
}

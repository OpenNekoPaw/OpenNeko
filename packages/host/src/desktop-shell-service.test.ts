import { describe, expect, it, vi } from 'vitest';
import { AGENT_HOME_PROJECTION_VERSION } from '@neko/agent-contracts';
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

describe('DesktopShellService', () => {
  it('starts at Home by default without deleting restored project tabs', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const projection = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      projection.endpointEpoch,
      projection.window.revision,
    );
    expect(opened.projection.window.activeTarget.kind).toBe('project');
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindowId = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindowId, 1);
    const restored = await second.service.getProjection(restoredWindowId);

    expect(restored.window.activeTarget).toEqual({ kind: 'home' });
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.catalog.projects).toHaveLength(1);
  });

  it('scopes the Agent Home catalog from persisted Projects before the first snapshot', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const firstWindowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(firstWindowId, 1);
    const initial = await first.service.getProjection(firstWindowId);
    await first.service.openContent(
      firstWindowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    first.service.releaseWindow(firstWindowId);
    await first.service.dispose();

    const second = createFixture(file);
    const setHomeWorkspaceScope = vi.fn<(workspaceIds: readonly string[]) => void>();
    second.service.setAgentHomeProjectionSource({
      setHomeWorkspaceScope,
      readHomeProjection: () => ({
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 1,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });

    const restoredWindowId = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindowId, 1);
    await second.service.getProjection(restoredWindowId);

    expect(setHomeWorkspaceScope).toHaveBeenCalledWith(['11111111-1111-4111-8111-111111111111']);
  });

  it('validates standalone Assistant lifecycle identity without requiring a Project', async () => {
    const fixture = createFixture();
    const navigation = {
      conversationId: 'conversation:assistant',
      owner: { kind: 'assistant' as const, assistantSpaceId: 'assistant-space:local-user' },
    };
    fixture.service.setAgentHomeProjectionSource({
      setHomeWorkspaceScope: () => undefined,
      readHomeProjection: () => ({
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 4,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const projection = await fixture.service.getProjection(windowId);

    await expect(
      fixture.service.assertAgentHomeConversation(
        windowId,
        projection.endpointEpoch,
        projection.window.revision,
        projection.agentHome.revision,
        navigation,
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture.service.assertAgentHomeConversation(
        windowId,
        projection.endpointEpoch,
        projection.window.revision,
        projection.agentHome.revision,
        {
          conversationId: navigation.conversationId,
          owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:other' },
        },
      ),
    ).rejects.toMatchObject({
      code: 'desktop-shell-conversation-not-found',
    });
  });

  it('projects only fully composed Agent and Resource Browser capabilities as ready', async () => {
    const fixture = createFixture();
    fixture.service.setAgentCapabilityReady(true);
    fixture.service.setResourceBrowserCapabilityReady(true);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);

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
    first.service.setRendererEpoch(windowId, 1);
    const projection = await first.service.getProjection(windowId);
    const initialScene = await first.service.getSceneProjection(windowId);

    const transitioned = await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-1',
        expectedEndpointEpoch: projection.endpointEpoch,
        windowId,
        expectedWindowRevision: projection.window.revision,
        expectedSceneRevision: initialScene.revision,
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
    restored.service.setRendererEpoch(restoredWindowId, 1);
    expect(await restored.service.getSceneProjection(restoredWindowId)).toMatchObject({
      sceneId: `scene:${windowId}:settings`,
      revision: 1,
      context: { kind: 'settings', settingsSectionId: 'agent' },
    });
  });

  it('allocates a fresh unbound draft for every Start Creating transition', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    if (initial.window.scene.context.kind !== 'agent') {
      throw new Error('Initial Scene must be an Agent Entry Draft.');
    }
    const initialDraftId = initial.window.scene.context.scope.draftId;

    const first = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'start-creating-1',
        expectedEndpointEpoch: initial.endpointEpoch,
        windowId,
        expectedWindowRevision: initial.window.revision,
        expectedSceneRevision: initial.window.scene.revision,
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
        expectedEndpointEpoch: afterFirst.endpointEpoch,
        windowId,
        expectedWindowRevision: afterFirst.window.revision,
        expectedSceneRevision: afterFirst.window.scene.revision,
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
      new Set([initial.window.scene.sceneId, first.scene.sceneId, second.scene.sceneId]).size,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    if (
      initial.window.scene.context.kind !== 'agent' ||
      initial.window.scene.context.scope.kind !== 'unbound'
    ) {
      throw new Error('Assistant binding fixture requires an unbound Entry Draft.');
    }
    const draftId = initial.window.scene.context.scope.draftId;
    const bound = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'bind-assistant-1',
        expectedEndpointEpoch: initial.endpointEpoch,
        windowId,
        expectedWindowRevision: initial.window.revision,
        expectedSceneRevision: initial.window.scene.revision,
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
          expectedEndpointEpoch: afterBound.endpointEpoch,
          windowId,
          expectedWindowRevision: afterBound.window.revision,
          expectedSceneRevision: afterBound.window.scene.revision,
          intent: { kind: 'bind-agent-assistant', draftId },
        }),
      ),
    ).rejects.toMatchObject({ code: 'desktop-scene-stale-identity' });
    expect((await fixture.service.getProjection(windowId)).agentHome.conversations).toEqual([]);
  });

  it('rejects stale Scene CAS and returns owner-qualified unavailable without mutation', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const projection = await fixture.service.getProjection(windowId);
    const scene = await fixture.service.getSceneProjection(windowId);
    const staleRequest = createDesktopSceneTransitionRequest({
      requestId: 'scene-request-stale',
      expectedEndpointEpoch: projection.endpointEpoch,
      windowId,
      expectedWindowRevision: projection.window.revision,
      expectedSceneRevision: scene.revision + 1,
      intent: { kind: 'open-settings' },
    });

    await expect(fixture.service.transitionScene(staleRequest)).rejects.toMatchObject({
      code: 'desktop-scene-stale-identity',
    });

    const unavailable = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-workspace',
        expectedEndpointEpoch: projection.endpointEpoch,
        windowId,
        expectedWindowRevision: projection.window.revision,
        expectedSceneRevision: scene.revision,
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
    expect((await fixture.service.getProjection(windowId)).window.revision).toBe(
      projection.window.revision,
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
    fixture.service.setRendererEpoch(windowId, 1);
    let projection = await fixture.service.getProjection(windowId);
    await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      projection.endpointEpoch,
      projection.window.revision,
    );
    projection = await fixture.service.getProjection(windowId);
    const grant = authority.authorize({
      windowId,
      label: 'Demo',
      hostResource: '/workspace/demo',
    });

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-workspace',
        expectedEndpointEpoch: projection.endpointEpoch,
        windowId,
        expectedWindowRevision: projection.window.revision,
        expectedSceneRevision: projection.window.scene.revision,
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
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      workspace.workspacePath,
      initial.endpointEpoch,
      initial.window.revision,
    );
    const grant = authority.authorize({
      windowId,
      label: workspace.displayName,
      hostResource: workspace.workspacePath,
    });
    await first.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-workspace-preview',
        expectedEndpointEpoch: opened.projection.endpointEpoch,
        windowId,
        expectedWindowRevision: opened.projection.window.revision,
        expectedSceneRevision: opened.projection.window.scene.revision,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );
    const workspaceProjection = await first.service.getProjection(windowId);
    const current = workspaceProjection.window.workbench;
    const project = workspaceProjection.catalog.projects[0]!;
    const tab = workspaceProjection.window.tabs[0]!;
    const previewViewId = `preview:${tab.viewId}:temporary`;
    const updated = await first.service.updateWorkbench(
      windowId,
      workspaceProjection.endpointEpoch,
      workspaceProjection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: previewViewId,
              viewEpoch: tab.viewEpoch,
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

    expect(updated.window.scene.slots.main).toEqual({
      kind: 'workspace-main',
      workspaceId: workspace.workspaceId,
      viewId: previewViewId,
      viewEpoch: 1,
    });
    first.service.setRendererEpoch(windowId, 2);
    const reattached = await first.service.getProjection(windowId);
    expect(reattached.window.scene.slots.main).toMatchObject({
      viewId: previewViewId,
      viewEpoch: 2,
    });
    expect(reattached.window.workbench.main.views[0]).toMatchObject({
      viewId: previewViewId,
      viewEpoch: 2,
    });
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(repository, 'restore');
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindowId, 1);
    const restoredProjection = await restored.service.getProjection(restoredWindowId);
    const restoredMainView = restoredProjection.window.workbench.main.views[0]!;
    expect(restoredMainView).toMatchObject({
      kind: 'canvas',
      documentId: 'neko/boards/workspace.nkc',
    });
    expect(restoredProjection.window.scene.slots.main).toEqual({
      kind: 'workspace-main',
      workspaceId: workspace.workspaceId,
      viewId: restoredMainView.viewId,
      viewEpoch: restoredMainView.viewEpoch,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      workspace.workspacePath,
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-recent-project',
        expectedEndpointEpoch: opened.projection.endpointEpoch,
        windowId,
        expectedWindowRevision: opened.projection.window.revision,
        expectedSceneRevision: opened.projection.window.scene.revision,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const grant = authority.authorize({
      windowId,
      label: workspace.displayName,
      hostResource: workspace.workspacePath,
    });
    const stored = await repository.read();
    const window = stored.windows[0]!;
    const currentContext = window.scene.context;
    if (currentContext.kind !== 'agent' || currentContext.scope.kind !== 'unbound') {
      throw new Error('Active Conversation rejection fixture requires an Entry Draft.');
    }
    const scope = {
      kind: 'assistant' as const,
      draftId: currentContext.scope.draftId,
      assistantSpaceId: 'assistant-space:local-user',
      conversationId: 'conversation-1',
    };
    const scene = parseDesktopWorkbenchSceneProjection({
      ...window.scene,
      revision: window.scene.revision + 1,
      context: { ...currentContext, scope },
      slots: {
        ...window.scene.slots,
        interaction: {
          kind: 'agent',
          agentViewId: currentContext.agentViewId,
          phase: 'session',
          scope,
        },
      },
    });
    await repository.commit(stored.storageRevision, {
      ...stored,
      storageRevision: stored.storageRevision + 1,
      windows: [{ ...window, revision: window.revision + 1, scene }],
    });
    const projection = await fixture.service.getProjection(windowId);

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-rebind',
        expectedEndpointEpoch: projection.endpointEpoch,
        windowId,
        expectedWindowRevision: projection.window.revision,
        expectedSceneRevision: scene.revision,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      workspace.workspacePath,
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;
    const workspaceResult = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-open-project',
        expectedEndpointEpoch: opened.projection.endpointEpoch,
        windowId,
        expectedWindowRevision: opened.projection.window.revision,
        expectedSceneRevision: opened.projection.window.scene.revision,
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
    expect(before.window.scene.context).toMatchObject({
      kind: 'agent',
      scope: { kind: 'workspace', workspaceId: project.workspaceId },
    });

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-current-project',
        expectedEndpointEpoch: before.endpointEpoch,
        windowId,
        expectedWindowRevision: before.window.revision,
        expectedSceneRevision: before.window.scene.revision,
        intent: { kind: 'open-project-workspace', projectId: project.projectId },
      }),
    );

    expect(result).toEqual({
      status: 'transitioned',
      requestId: 'scene-request-current-project',
      scene: before.window.scene,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      workspace.workspacePath,
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;
    const workspaceResult = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-open-project-session-fixture',
        expectedEndpointEpoch: opened.projection.endpointEpoch,
        windowId,
        expectedWindowRevision: opened.projection.window.revision,
        expectedSceneRevision: opened.projection.window.scene.revision,
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
      revision: workspaceResult.scene.revision + 1,
      context: { ...context, scope },
      slots: {
        ...workspaceResult.scene.slots,
        interaction: {
          kind: 'agent',
          agentViewId: context.agentViewId,
          phase: 'session',
          scope,
        },
      },
    });
    await repository.commit(state.storageRevision, {
      ...state,
      storageRevision: state.storageRevision + 1,
      windows: [{ ...storedWindow, revision: storedWindow.revision + 1, scene: sessionScene }],
    });
    const before = await fixture.service.getProjection(windowId);
    const existingProjectTabs = before.window.tabs;
    const existingWorkbench = before.window.workbench;
    restore.mockClear();

    const result = await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'scene-request-current-project-session',
        expectedEndpointEpoch: before.endpointEpoch,
        windowId,
        expectedWindowRevision: before.window.revision,
        expectedSceneRevision: sessionScene.revision,
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
    expect(draftProjection.window.workbench).toEqual(existingWorkbench);
    expect(draftProjection.window.scene).not.toEqual(sessionScene);

    const attached = await fixture.service.attachAgentConversation({
      windowId,
      expectedEndpointEpoch: draftProjection.endpointEpoch,
      agentViewId: result.scene.context.agentViewId,
      context: {
        schemaVersion: 1,
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
    expect(sessionProjection.window.workbench).toEqual(existingWorkbench);
  });

  it('persists Sidebar CAS independently from Window and Workbench revisions', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const projection = await first.service.getProjection(windowId);
    const sidebar = await first.service.getApplicationSidebarProjection(windowId);

    const updated = await first.service.updateApplicationSidebar(
      createDesktopApplicationSidebarMutationRequest({
        requestId: 'sidebar-request-1',
        expectedEndpointEpoch: projection.endpointEpoch,
        windowId,
        expectedSidebarRevision: sidebar.revision,
        visible: false,
        width: 304,
      }),
    );

    expect(updated.window.applicationSidebar).toMatchObject({
      revision: 1,
      visible: false,
      width: 304,
    });
    const after = await first.service.getProjection(windowId);
    expect(after.window.revision).toBe(projection.window.revision);
    expect(after.window.workbench).toEqual(projection.window.workbench);
    await expect(
      first.service.updateApplicationSidebar(
        createDesktopApplicationSidebarMutationRequest({
          requestId: 'sidebar-request-stale',
          expectedEndpointEpoch: projection.endpointEpoch,
          windowId,
          expectedSidebarRevision: sidebar.revision,
          visible: true,
          width: 240,
        }),
      ),
    ).rejects.toMatchObject({ code: 'desktop-scene-stale-identity' });

    first.service.releaseWindow(windowId);
    await first.service.dispose();
    const restored = createFixture(file, 'restore');
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindowId, 1);
    expect(await restored.service.getApplicationSidebarProjection(restoredWindowId)).toMatchObject({
      revision: 1,
      visible: false,
      width: 304,
    });
  });

  it('reuses one Project and focuses one Tab for duplicate opens', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);

    const first = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const second = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      first.projection.endpointEpoch,
      first.projection.window.revision,
    );

    expect(first.projection.catalog.projects).toHaveLength(1);
    expect(second.projection.catalog.projects).toHaveLength(1);
    expect(second.projection.window.tabs).toHaveLength(1);
    expect(second.projection.window.revision).toBe(first.projection.window.revision);
    expect(first.workspace).toEqual(second.workspace);
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(2);
  });

  it('opens the canonical Workspace Canvas when a Project has no stored Main View', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);

    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );

    expect(opened.projection.window.workbench).toMatchObject({
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
    expect(opened.projection.window.workbench.main.groups[0]).toMatchObject({
      viewIds: [opened.projection.window.workbench.main.views[0]?.viewId],
      activeViewId: opened.projection.window.workbench.main.views[0]?.viewId,
    });
  });

  it('restores the canonical Workspace Canvas before projecting an active Project with an empty Main group', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    const canvasView = current.main.views[0];
    if (!canvasView) throw new Error('Expected the default Workspace Canvas View.');
    await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      closeMainView(current, canvasView.viewId),
    );
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file, 'restore');
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindow, 1);
    const projection = await restored.service.getProjection(restoredWindow);

    expect(projection.window.activeTarget.kind).toBe('project');
    expect(projection.window.workbench.main.views).toEqual([
      expect.objectContaining({
        kind: 'canvas',
        documentId: 'neko/boards/workspace.nkc',
      }),
    ]);
    expect(projection.window.workbench.main.groups[0]).toMatchObject({
      viewIds: [projection.window.workbench.main.views[0]?.viewId],
      activeViewId: projection.window.workbench.main.views[0]?.viewId,
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
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const grant = authority.authorize({
      windowId,
      label: 'Demo',
      hostResource: '/workspace/demo',
    });
    await fixture.service.transitionScene(
      createDesktopSceneTransitionRequest({
        requestId: 'activate-live-workspace',
        expectedEndpointEpoch: initial.endpointEpoch,
        windowId,
        expectedWindowRevision: initial.window.revision,
        expectedSceneRevision: initial.window.scene.revision,
        intent: { kind: 'open-workspace', workspaceGrantId: grant.workspaceGrantId },
      }),
    );
    const active = await fixture.service.getProjection(windowId);
    const mainView = active.window.workbench.main.views[0];
    if (!mainView) throw new Error('Expected the canonical Workspace Main View.');

    const closed = await fixture.service.updateWorkbench(
      windowId,
      active.endpointEpoch,
      active.window.revision,
      active.window.workbench.revision,
      closeMainView(active.window.workbench, mainView.viewId),
    );

    expect(closed.window.workbench.main).toMatchObject({
      views: [],
      groups: [{ groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, viewIds: [] }],
    });
    expect(closed.window.scene).toMatchObject({
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
    expect(closed.window.scene.slots.main).toBeUndefined();
    expect(closed.window.scene.slots.timeline).toBeUndefined();

    fixture.service.setRendererEpoch(windowId, 2);
    const reattached = await fixture.service.getProjection(windowId);
    expect(reattached.window.scene.slots.main).toBeUndefined();
    expect(reattached.window.scene.slots.interaction).toMatchObject({
      kind: 'agent',
      phase: 'draft',
    });
  });

  it('restores a Workspace conversation with its Project target, Workbench and Agent phase together', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0];
    const tab = opened.projection.window.tabs[0];
    if (!project || !tab) throw new Error('Expected the persisted Workspace Project and Tab.');
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file, 'home');
    restored.service.setAgentHomeProjectionSource({
      setHomeWorkspaceScope: () => undefined,
      readHomeProjection: () => ({
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 1,
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
    restored.service.setRendererEpoch(restoredWindowId, 1);
    const entry = await restored.service.getProjection(restoredWindowId);
    expect(entry.window.activeTarget).toEqual({ kind: 'home' });

    const result = await restored.service.restoreAgentConversation({
      request: createDesktopSceneTransitionRequest({
        requestId: 'restore-workspace-conversation-atomically',
        expectedEndpointEpoch: entry.endpointEpoch,
        windowId: restoredWindowId,
        expectedWindowRevision: entry.window.revision,
        expectedSceneRevision: entry.window.scene.revision,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: 'conversation-workspace-1',
            owner: { kind: 'workspace', workspaceId: project.workspaceId },
          },
        },
      }),
      context: {
        schemaVersion: 1,
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
    expect(committed.window.workbench.main.views).toEqual([
      expect.objectContaining({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
      }),
    ]);
    expect(committed.window.scene).toEqual(result.scene);

    const existingWorkbench = committed.window.workbench;
    const second = await restored.service.restoreAgentConversation({
      request: createDesktopSceneTransitionRequest({
        requestId: 'restore-second-workspace-conversation-in-existing-workbench',
        expectedEndpointEpoch: committed.endpointEpoch,
        windowId: restoredWindowId,
        expectedWindowRevision: committed.window.revision,
        expectedSceneRevision: committed.window.scene.revision,
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: 'conversation-workspace-2',
            owner: { kind: 'workspace', workspaceId: project.workspaceId },
          },
        },
      }),
      context: {
        schemaVersion: 1,
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
    expect(afterSecond.window.workbench).toEqual(existingWorkbench);
  });

  it('shares a Project owner while isolating cross-window Tab and View identity', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(firstWindow, 1);
    fixture.service.setRendererEpoch(secondWindow, 1);
    const firstEvents = vi.fn();
    const secondEvents = vi.fn();
    fixture.service.subscribe(firstWindow, firstEvents);
    fixture.service.subscribe(secondWindow, secondEvents);
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);

    const first = await fixture.service.openContent(
      firstWindow,
      '/workspace/demo',
      firstInitial.endpointEpoch,
      firstInitial.window.revision,
    );
    const second = await fixture.service.openContent(
      secondWindow,
      '/workspace/demo',
      secondInitial.endpointEpoch,
      secondInitial.window.revision,
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

  it('removes one recent Project and all of its cross-window Tabs without deleting workspace files', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(firstWindow, 1);
    fixture.service.setRendererEpoch(secondWindow, 1);
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);
    const firstOpened = await fixture.service.openContent(
      firstWindow,
      '/workspace/demo',
      firstInitial.endpointEpoch,
      firstInitial.window.revision,
    );
    await fixture.service.openContent(
      secondWindow,
      '/workspace/demo',
      secondInitial.endpointEpoch,
      secondInitial.window.revision,
    );
    const project = firstOpened.projection.catalog.projects[0]!;

    const removed = await fixture.service.removeRecentProject(
      firstWindow,
      project.projectId,
      firstOpened.projection.endpointEpoch,
      firstOpened.projection.window.revision,
      firstOpened.projection.catalog.revision,
    );
    const secondProjection = await fixture.service.getProjection(secondWindow);

    expect(removed.catalog.projects).toEqual([]);
    expect(removed.window).toMatchObject({
      activeTarget: { kind: 'home' },
      tabs: [],
    });
    expect(secondProjection.window).toMatchObject({
      activeTarget: { kind: 'home' },
      tabs: [],
    });
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(2);
  });

  it('removes the Project-owned Workbench Views while Home is active', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;
    const tab = opened.projection.window.tabs[0]!;
    const current = opened.projection.window.workbench;
    const withCanvas = await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: 'canvas:view-1:main',
              viewEpoch: tab.viewEpoch,
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
    const home = await first.service.activateHome(
      windowId,
      withCanvas.endpointEpoch,
      withCanvas.window.revision,
    );

    const removed = await first.service.removeRecentProject(
      windowId,
      project.projectId,
      home.endpointEpoch,
      home.window.revision,
      home.catalog.revision,
    );

    expect(removed.window.workbench.main.views).toEqual([]);
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindowId, 1);
    await expect(restored.service.getProjection(restoredWindowId)).resolves.toMatchObject({
      catalog: { projects: [] },
      window: {
        activeTarget: { kind: 'home' },
        workbench: { main: { views: [] } },
      },
    });
  });

  it('rejects a stale Project catalog removal without changing Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;

    await expect(
      fixture.service.removeRecentProject(
        windowId,
        project.projectId,
        opened.projection.endpointEpoch,
        opened.projection.window.revision,
        opened.projection.catalog.revision - 1,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });

    expect(await fixture.service.getProjection(windowId)).toEqual(opened.projection);
  });

  it('rejects stale Window revisions without changing state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const tabId = opened.projection.window.tabs[0]!.tabId;
    await fixture.service.closeTab(
      windowId,
      tabId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );

    await expect(
      fixture.service.activateTab(
        windowId,
        tabId,
        opened.projection.endpointEpoch,
        opened.projection.window.revision,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect((await fixture.service.getProjection(windowId)).window.tabs).toEqual([]);
  });

  it('returns unavailable profiles without persisting Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const before = await fixture.service.getProjection(windowId);

    const result = await fixture.service.requestUnavailableProfile(windowId, 'request-1', 'world');
    const after = await fixture.service.getProjection(windowId);

    expect(result.diagnostic.code).toBe('desktop-project-profile-unavailable');
    expect(after).toEqual(before);
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('restores the primary Window layout and advances endpoint epoch after restart', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const firstWindow = await first.service.claimWindowId();
    first.service.setRendererEpoch(firstWindow, 1);
    const initial = await first.service.getProjection(firstWindow);
    await first.service.openContent(
      firstWindow,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    first.service.releaseWindow(firstWindow);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindow = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindow, 1);
    const restored = await second.service.getProjection(restoredWindow);

    expect(restoredWindow).toBe(firstWindow);
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.endpointEpoch).toContain('app-2');
  });

  it('persists Workbench layout through Window and Workbench revision CAS', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    const next = {
      ...current,
      revision: current.revision + 1,
      resourceDock: {
        ...current.resourceDock,
        presentation: 'overlay' as const,
      },
    };

    const updated = await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      next,
    );

    expect(updated.window.workbench).toMatchObject({
      revision: current.revision + 1,
      resourceDock: { presentation: 'overlay' },
    });
    await expect(
      first.service.updateWorkbench(
        windowId,
        updated.endpointEpoch,
        updated.window.revision,
        current.revision,
        { ...next, revision: next.revision + 1 },
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });

    first.service.releaseWindow(windowId);
    await first.service.dispose();
    const restored = createFixture(file);
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindow, 1);

    expect((await restored.service.getProjection(restoredWindow)).window.workbench).toMatchObject({
      resourceDock: { presentation: 'overlay' },
    });
  });

  it('preserves the visible Project Resource Dock when the same Project reattaches', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    const withResources = await fixture.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        resourceDock: { presentation: 'docked', width: 412 },
      },
    );

    const reattached = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      withResources.endpointEpoch,
      withResources.window.revision,
    );

    expect(reattached.projection.window.workbench.resourceDock).toEqual({
      presentation: 'docked',
      width: 412,
    });
  });

  it('rejects legacy Workbench updates while no Project is active', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const home = await fixture.service.activateHome(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );
    fixture.service.setRendererEpoch(windowId, 2);
    const reattachedHome = await fixture.service.getProjection(windowId);
    const current = reattachedHome.window.workbench;
    await expect(
      fixture.service.updateWorkbench(
        windowId,
        reattachedHome.endpointEpoch,
        home.window.revision,
        current.revision,
        {
          ...current,
          revision: current.revision + 1,
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
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: 'preview:view-1',
              viewEpoch: opened.projection.window.tabs[0]!.viewEpoch,
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
    restored.service.setRendererEpoch(restoredWindow, 1);
    const projection = await restored.service.getProjection(restoredWindow);

    expect(projection.window.activeTarget.kind).toBe('project');
    expect(projection.window.workbench).toMatchObject({
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
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    const tab = opened.projection.window.tabs[0]!;
    const project = opened.projection.catalog.projects[0]!;
    await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: 'preview:view-1:pinned',
              viewEpoch: tab.viewEpoch,
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
    restored.service.setRendererEpoch(restoredWindow, 1);
    const projection = await restored.service.getProjection(restoredWindow);

    expect(projection.window.workbench.main.views).toEqual([
      expect.objectContaining({
        viewId: 'preview:view-1:pinned',
        ownerId: 'preview-session:pinned-1',
        documentId: 'resource-1',
        previewPresentation: 'pinned',
      }),
    ]);
    expect(JSON.stringify(projection.window.workbench)).not.toMatch(
      /descriptor|absolutePath|neko-media:/u,
    );
  });

  it('resolves a restored Agent workspace through the Host-only persisted locator', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
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
    fixture.service.setRendererEpoch(windowId, 1);
    const stale = await fixture.service.getProjection(windowId);
    fixture.service.setRendererEpoch(windowId, 2);

    await expect(
      fixture.service.openContent(
        windowId,
        '/workspace/demo',
        stale.endpointEpoch,
        stale.window.revision,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('advances View epochs when a renderer reattaches without changing the View owner', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const firstView = opened.projection.window.tabs[0];
    fixture.service.setRendererEpoch(windowId, 2);
    const reattached = await fixture.service.getProjection(windowId);

    expect(reattached.window.tabs[0]).toMatchObject({
      viewId: firstView?.viewId,
      viewEpoch: 2,
    });
    expect(firstView?.viewEpoch).toBe(1);
    expect(reattached.endpointEpoch).not.toBe(opened.projection.endpointEpoch);
  });

  it('reopens a closed catalog Project with a new View identity', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const firstTab = opened.projection.window.tabs[0]!;
    const closed = await fixture.service.closeTab(
      windowId,
      firstTab.tabId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );
    const reopened = await fixture.service.openCatalogProject(
      windowId,
      opened.projection.catalog.projects[0]!.projectId,
      closed.endpointEpoch,
      closed.window.revision,
    );

    expect(reopened.projection.window.tabs[0]?.viewId).not.toBe(firstTab.viewId);
    expect(reopened.projection.window.tabs[0]?.viewEpoch).toBe(1);
  });

  it('authorizes a new Cut target from the sender-bound active Project before attaching its View', async () => {
    const fixture = createFixture();
    fixture.service.setCutCapabilityReady(true);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0];
    const tab = opened.projection.window.tabs[0];
    if (!project || !tab) throw new Error('Cut creation fixture Project is unavailable.');
    const identity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId,
      viewId: 'cut:new-target',
      viewEpoch: tab.viewEpoch,
      documentId: 'edits/new-target.otio',
      sessionId: createCutHostSessionId('cut:new-target', tab.viewEpoch),
      endpointEpoch: opened.projection.endpointEpoch,
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
) {
  let identity = 0;
  const resolution: AssetWorkspaceResolution = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath: '/workspace/demo',
    displayName: 'Demo',
    locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
  };
  const registry: DesktopWorkspaceResolutionPort & {
    readonly resolve: ReturnType<typeof vi.fn>;
  } = {
    resolve: vi.fn(async () => resolution),
    dispose: vi.fn(async () => undefined),
  };
  const applicationInstanceId = repository.applicationCount === 0 ? 'app-1' : 'app-2';
  repository.applicationCount += 1;
  return {
    registry,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: repository,
      workspaceRegistry: registry,
      ...(workspaceGrantAuthority ? { workspaceGrantAuthority } : {}),
      startupTarget,
      createIdentity: () => `identity-${(identity += 1)}`,
      now: () => '2026-07-27T00:00:00.000Z',
    }),
  };
}

function createMemoryFile(): InMemoryDesktopShellStateRepository {
  return createInMemoryDesktopShellStateRepository();
}

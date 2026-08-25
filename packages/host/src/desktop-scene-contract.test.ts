import { describe, expect, it } from 'vitest';
import {
  DesktopSceneContractError,
  applyDesktopApplicationSidebarMutation,
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  createDesktopApplicationSidebarMutationRequest,
  createDesktopSceneTransitionRequest,
  parseDesktopApplicationSidebarMutationRequest,
  parseDesktopApplicationSidebarProjection,
  parseDesktopSceneTransitionRequest,
  parseDesktopSceneTransitionResult,
  parseDesktopWorkbenchSceneProjection,
} from './desktop-scene-contract';

describe('Desktop Scene contract', () => {
  it('creates an unbound Entry Draft scene with exact Window and draft identities', () => {
    expect(createDefaultDesktopAgentScene('window-1', 'draft-1')).toEqual({
      sceneId: 'scene:window-1:agent:draft-1',
      windowId: 'window-1',
      context: {
        kind: 'agent',
        agentViewId: 'agent-view:window-1:draft-1',
        scope: { kind: 'unbound', draftId: 'draft-1' },
      },
      slots: {
        interaction: {
          kind: 'agent',
          agentSurfaceId: 'agent-surface:window-1:draft-1',
          agentViewId: 'agent-view:window-1:draft-1',
          phase: 'draft',
          scope: { kind: 'unbound', draftId: 'draft-1' },
        },
        status: { kind: 'scene-status', sceneId: 'scene:window-1:agent:draft-1' },
      },
    });
  });

  it('accepts only slot refs matching the exact Workspace scope', () => {
    const projection = workspaceScene();
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);

    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          main: { ...projection.slots.main, workspaceId: 'workspace-other' },
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopSceneContractError>>({
        code: 'desktop-scene-scope-mismatch',
      }),
    );
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          cutPanel: { ...projection.slots.cutPanel, workspaceId: 'workspace-other' },
        },
      }),
    ).toThrow('Workspace Cut Panel does not match Agent Workspace scope');
  });

  it('accepts exact Character and World authoring Surfaces only in their Workspace scope', () => {
    const projection = workspaceScene();
    const character = {
      ...projection,
      slots: {
        ...projection.slots,
        main: {
          kind: 'character-authoring' as const,
          workspaceId: 'workspace-1',
          authority: { kind: 'project' as const, projectId: 'project-1' },
          viewId: 'character-view-1',
          viewInstanceId: 'character-view-instance-1',
          characterProjectId: 'character-project-1',
        },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(character)).toEqual(character);
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...character,
        slots: {
          ...character.slots,
          main: { ...character.slots.main, workspaceId: 'workspace-other' },
        },
      }),
    ).toThrow('does not match Workspace identity');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...character,
        slots: {
          ...character.slots,
          main: { ...character.slots.main, worldProjectId: 'world-project-1' },
        },
      }),
    ).toThrow("unknown field 'worldProjectId'");

    const world = {
      ...projection,
      slots: {
        ...projection.slots,
        main: {
          kind: 'world-authoring' as const,
          workspaceId: 'workspace-1',
          authority: { kind: 'project' as const, projectId: 'project-1' },
          viewId: 'world-view-1',
          viewInstanceId: 'world-view-instance-1',
          worldProjectId: 'world-project-1',
        },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(world)).toEqual(world);
  });

  it('rejects incompatible slots, unknown kinds and renderer component payloads', () => {
    const assistantDraft = createDefaultDesktopAgentScene('window-1', 'draft-1');
    const assistantScope = {
      kind: 'assistant' as const,
      draftId: 'draft-1',
      assistantSpaceId: 'assistant-space:user',
    };
    const assistant = {
      ...assistantDraft,
      context: { ...assistantDraft.context, scope: assistantScope },
      slots: {
        ...assistantDraft.slots,
        interaction: { ...assistantDraft.slots.interaction, scope: assistantScope },
      },
    };
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...assistant,
        slots: {
          ...assistant.slots,
          main: {
            kind: 'workspace-main',
            workspaceId: 'workspace-1',
            viewId: 'view-1',
            viewInstanceId: 'view-instance-1',
          },
        },
      }),
    ).toThrow('Assistant Scene Main Surface');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...assistant,
        slots: {
          ...assistant.slots,
          cutPanel: {
            kind: 'workspace-cut',
            workspaceId: 'workspace-1',
            viewId: 'cut-1',
            viewInstanceId: 'cut-instance-1',
            ownerId: 'cut-owner-1',
          },
        },
      }),
    ).toThrow('cannot mount a Workspace Cut Panel');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...assistant,
        context: { kind: 'world' },
      }),
    ).toThrow("Unknown Desktop Scene context kind 'world'");
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...assistant,
        slots: { ...assistant.slots, component: 'AgentRoot' },
      }),
    ).toThrow("contains unknown field 'component'");
  });

  it('requires an exact Assistant Conversation and Scratch owner for Preview', () => {
    const draft = createDefaultDesktopAgentScene('window-1', 'draft-1');
    const scope = {
      kind: 'assistant' as const,
      draftId: 'draft-1',
      assistantSpaceId: 'assistant-space:user',
      conversationId: 'conversation:1',
    };
    const scene = {
      ...draft,
      context: { ...draft.context, scope },
      slots: {
        ...draft.slots,
        interaction: { ...draft.slots.interaction, phase: 'session' as const, scope },
        main: {
          kind: 'assistant-preview' as const,
          assistantSpaceId: 'assistant-space:user',
          conversationId: 'conversation:1',
          scratchArtifactId: 'scratch:1',
          previewSessionId: 'preview:1',
        },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(scene)).toEqual(scene);
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...scene,
        slots: {
          ...scene.slots,
          main: { ...scene.slots.main, conversationId: 'conversation:other' },
        },
      }),
    ).toThrow('does not match Assistant Space');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...scene,
        slots: {
          ...scene.slots,
          main: { ...scene.slots.main, hostPath: '/Users/private/result.png' },
        },
      }),
    ).toThrow("unknown field 'hostPath'");
  });

  it('keeps Asset management and Preview on one AssetCenter session', () => {
    const projection = {
      sceneId: 'scene:window-1:assets',
      windowId: 'window-1',
      context: { kind: 'asset-center' as const, assetCenterSessionId: 'assets-1' },
      slots: {
        main: {
          kind: 'asset-management' as const,
          assetCenterSessionId: 'assets-1',
        },
        secondaryMain: {
          kind: 'asset-preview' as const,
          assetCenterSessionId: 'assets-1',
          previewSessionId: 'preview-1',
        },
        status: { kind: 'scene-status' as const, sceneId: 'scene:window-1:assets' },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          secondaryMain: {
            ...projection.slots.secondaryMain,
            assetCenterSessionId: 'assets-other',
          },
        },
      }),
    ).toThrow('Asset Preview Surface does not match Asset Center Session');
  });

  it('keeps Skill/MCP management Roots in Main instead of manager docks', () => {
    const sceneId = 'scene:window-1:extensions';
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: { kind: 'extensions' as const },
      slots: {
        main: { kind: 'extension-management' as const },
        status: { kind: 'scene-status' as const, sceneId },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          leftManager: { kind: 'extension-catalog' },
          status: projection.slots.status,
        },
      }),
    ).toThrow("Unknown Manager Surface kind 'extension-catalog'");
  });

  it('binds Character Presentation and separate Timeline refs to one exact owner', () => {
    const projection = characterRoomScene();
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          interaction: projection.slots.interaction,
          main: projection.slots.main,
          rightManager: projection.slots.rightManager,
          status: projection.slots.status,
        },
      }),
    ).toEqual({
      ...projection,
      slots: {
        interaction: projection.slots.interaction,
        main: projection.slots.main,
        rightManager: projection.slots.rightManager,
        status: projection.slots.status,
      },
    });

    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          main: {
            ...projection.slots.main,
            owner: { kind: 'room', roomId: 'room-other', roomRunId: 'room-run-other' },
          },
        },
      }),
    ).toThrow('exact Presentation Main Surface');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          cutPanel: {
            ...projection.slots.cutPanel,
            timelines: projection.slots.cutPanel.timelines.map((timeline, index) =>
              index === 0
                ? { ...timeline, timelineId: 'timeline-duplicate' }
                : { ...timeline, timelineId: 'timeline-duplicate' },
            ),
          },
        },
      }),
    ).toThrow('unique Timeline identities');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          cutPanel: {
            ...projection.slots.cutPanel,
            timelines: [
              {
                ...projection.slots.cutPanel.timelines[0],
                owner: { kind: 'room', roomId: 'room-other', roomRunId: 'room-run-other' },
              },
              projection.slots.cutPanel.timelines[1],
            ],
          },
        },
      }),
    ).toThrow('does not match its Stack owner');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          cutPanel: { kind: 'character-room-timeline', owner: projection.context.owner },
        },
      }),
    ).toThrow("contains unknown field 'owner'");
  });

  it('owns Creative Management Character catalog and exact detail as one Window scene', () => {
    const sceneId = 'scene:window-1:creative-management';
    const detail = { kind: 'global' as const, globalCharacterId: 'global-character:lin' };
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: { kind: 'creative-management' as const, catalog: 'characters' as const, detail },
      slots: {
        main: { kind: 'creative-management' as const, catalog: 'characters' as const },
        secondaryMain: { kind: 'character-detail' as const, selection: detail },
        status: { kind: 'scene-status' as const, sceneId },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-character-management',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-1',
        intent: { kind: 'open-creative-management', catalog: 'characters' },
      }).intent,
    ).toEqual({ kind: 'open-creative-management', catalog: 'characters' });
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-character-detail',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId,
        intent: { kind: 'select-character-detail', selection: detail },
      }).intent,
    ).toEqual({ kind: 'select-character-detail', selection: detail });
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          main: { kind: 'creative-management', catalog: 'content-projects' },
          status: projection.slots.status,
        },
      }),
    ).toThrow('Creative Management Scene requires its exact catalog Main Surface');
  });

  it('owns Works as one exact Creative Management scene and rejects the removed Templates path', () => {
    const sceneId = 'scene:window-1:creative-management';
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: { kind: 'creative-management' as const, catalog: 'works' as const },
      slots: {
        main: { kind: 'creative-management' as const, catalog: 'works' as const },
        status: { kind: 'scene-status' as const, sceneId },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-works',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-1',
        intent: { kind: 'open-creative-management', catalog: 'works' },
      }).intent,
    ).toEqual({ kind: 'open-creative-management', catalog: 'works' });
    expect(() =>
      parseDesktopSceneTransitionRequest({
        requestId: 'request-templates',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-1',
        intent: { kind: 'open-creative-management', catalog: 'templates' },
      }),
    ).toThrow('Creative Management catalog');
  });

  it('owns the World catalog and exact detail without an Experience runtime slot', () => {
    const sceneId = 'scene:window-1:creative-management';
    const detail = { kind: 'global' as const, globalWorldId: 'global-world:archive-city' };
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: { kind: 'creative-management' as const, catalog: 'worlds' as const, detail },
      slots: {
        main: { kind: 'creative-management' as const, catalog: 'worlds' as const },
        secondaryMain: { kind: 'world-detail' as const, selection: detail },
        status: { kind: 'scene-status' as const, sceneId },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-world-management',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-1',
        intent: { kind: 'open-creative-management', catalog: 'worlds' },
      }).intent,
    ).toEqual({ kind: 'open-creative-management', catalog: 'worlds' });
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-world-detail',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId,
        intent: { kind: 'select-world-detail', selection: detail },
      }).intent,
    ).toEqual({ kind: 'select-world-detail', selection: detail });
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-world-authoring',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId,
        intent: {
          kind: 'open-world-authoring',
          workspaceGrantId: 'world-grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
          worldProjectId: 'world-project-1',
        },
      }).intent,
    ).toEqual({
      kind: 'open-world-authoring',
      workspaceGrantId: 'world-grant-1',
      authority: { kind: 'project', projectId: 'project-1' },
      worldProjectId: 'world-project-1',
    });
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          main: { kind: 'creative-management', catalog: 'characters' },
          secondaryMain: projection.slots.secondaryMain,
          status: projection.slots.status,
        },
      }),
    ).toThrow('Creative Management Scene requires its exact catalog Main Surface');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          secondaryMain: {
            kind: 'character-detail',
            selection: { kind: 'global', globalCharacterId: 'global-character:wrong-owner' },
          },
        },
      }),
    ).toThrow('World Detail Surface does not match Scene selection');
  });

  it('owns one fixed World Runtime composition for an exact participant binding', () => {
    const binding = {
      worldProjectId: 'world-project-1',
      worldVersionId: 'world-version-1',
      worldRunId: 'world-run-1',
      worldSaveId: 'world-save-1',
      branchId: 'branch-main',
      participantId: 'participant-1',
      actorId: 'actor-1',
    };
    const surface = {
      worldRunId: binding.worldRunId,
      worldSaveId: binding.worldSaveId,
      branchId: binding.branchId,
      participantId: binding.participantId,
    };
    const sceneId = 'scene:window-1:world-runtime:world-run-1';
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: { kind: 'world-runtime' as const, binding },
      slots: {
        interaction: { kind: 'world-runtime-interaction' as const, ...surface },
        main: { kind: 'world-runtime-main' as const, ...surface },
        rightManager: { kind: 'world-runtime-manager' as const, ...surface },
        cutPanel: { kind: 'world-runtime-timeline' as const, ...surface },
        status: { kind: 'world-runtime-status' as const, sceneId, ...surface },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-runtime',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-management',
        intent: { kind: 'open-world-runtime', binding },
      }).intent,
    ).toEqual({ kind: 'open-world-runtime', binding });

    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          rightManager: { ...projection.slots.rightManager, branchId: 'branch-other' },
        },
      }),
    ).toThrow('exact right Manager Surface');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          secondaryMain: {
            kind: 'world-detail',
            selection: { kind: 'global', globalWorldId: 'global-world:unrelated' },
          },
        },
      }),
    ).toThrow('cannot mount unrelated secondary or left surfaces');
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          ...projection.slots,
          interaction: { kind: 'world-runtime-wildcard', worldRunId: '*' },
        },
      }),
    ).toThrow("contains unknown field 'worldRunId'");
  });

  it('rejects the retired standalone authoring authority without a compatibility decoder', () => {
    expect(() =>
      parseDesktopSceneTransitionRequest({
        requestId: 'request-standalone-character-authoring',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-1',
        intent: {
          kind: 'open-character-authoring',
          workspaceGrantId: 'character-library-grant',
          authority: { kind: 'standalone-library', library: 'character' },
          characterProjectId: 'character-project-1',
        },
      }),
    ).toThrow("Unknown Desktop authoring authority 'standalone-library'");
  });

  it('creates exact Scene identity transition requests and rejects arbitrary intent', () => {
    expect(() =>
      parseDesktopSceneTransitionRequest({
        requestId: 'request-old-management',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: { kind: 'open-project-management' },
      }),
    ).toThrow("Unknown Desktop Scene transition intent 'open-project-management'");
    expect(
      createDesktopSceneTransitionRequest({
        requestId: 'request-1',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: { kind: 'open-workspace', workspaceGrantId: 'grant-1' },
      }),
    ).toEqual({
      requestId: 'request-1',
      rendererSessionId: 'endpoint-1',
      windowId: 'window-1',
      sceneId: 'scene-2',
      intent: { kind: 'open-workspace', workspaceGrantId: 'grant-1' },
    });
    expect(
      createDesktopSceneTransitionRequest({
        requestId: 'request-project',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: { kind: 'open-project-workspace', projectId: 'project-1' },
      }).intent,
    ).toEqual({ kind: 'open-project-workspace', projectId: 'project-1' });
    expect(
      createDesktopSceneTransitionRequest({
        requestId: 'request-conversation',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: {
          kind: 'restore-conversation',
          navigation: {
            conversationId: 'conversation-1',
            owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:user' },
          },
        },
      }).intent,
    ).toEqual({
      kind: 'restore-conversation',
      navigation: {
        conversationId: 'conversation-1',
        owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:user' },
      },
    });
    expect(() =>
      parseDesktopSceneTransitionRequest({
        requestId: 'request-invalid-conversation-shape',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: { kind: 'restore-conversation', conversationId: 'conversation-1' },
      }),
    ).toThrow("Restore Conversation intent contains unknown field 'conversationId'");
    expect(() =>
      parseDesktopSceneTransitionRequest({
        requestId: 'request-1',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: { kind: 'open-home' },
      }),
    ).toThrow("Unknown Desktop Scene transition intent 'open-home'");
    expect(() =>
      parseDesktopSceneTransitionRequest({
        requestId: 'request-removed-assistant-binding',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId: 'scene-2',
        intent: { kind: 'bind-agent-assistant', draftId: 'draft-1' },
      }),
    ).toThrow("Unknown Desktop Scene transition intent 'bind-agent-assistant'");
  });

  it('strictly decodes transitioned and owner-unavailable results', () => {
    const scene = createDefaultDesktopAgentScene('window-1', 'assistant-space:user');
    expect(
      parseDesktopSceneTransitionResult({
        status: 'transitioned',
        requestId: 'request-1',
        scene,
      }),
    ).toEqual({ status: 'transitioned', requestId: 'request-1', scene });
    expect(
      parseDesktopSceneTransitionResult({
        status: 'unavailable',
        requestId: 'request-2',
        diagnostic: {
          code: 'desktop-scene-owner-unavailable',
          severity: 'error',
          message: 'Workspace authority is unavailable.',
          metadata: {
            owner: 'workspace-authority',
            intentKind: 'open-workspace',
          },
        },
      }),
    ).toMatchObject({
      status: 'unavailable',
      diagnostic: { metadata: { owner: 'workspace-authority' } },
    });
    expect(
      parseDesktopSceneTransitionResult({
        status: 'unavailable',
        requestId: 'request-character',
        diagnostic: {
          code: 'desktop-scene-owner-unavailable',
          severity: 'error',
          message: 'Character owner is unavailable.',
          metadata: {
            owner: 'agent-conversation-authority',
            intentKind: 'restore-conversation',
            conversationOwnerKind: 'character',
          },
        },
      }),
    ).toMatchObject({
      diagnostic: { metadata: { conversationOwnerKind: 'character' } },
    });
    expect(() =>
      parseDesktopSceneTransitionResult({
        status: 'transitioned',
        requestId: 'request-3',
        scene,
        component: 'SettingsRoot',
      }),
    ).toThrow("contains unknown field 'component'");
  });

  it('validates an independent Sidebar projection and sender-bound mutation', () => {
    const sidebar = createDefaultDesktopApplicationSidebar('window-1');
    expect(sidebar).toEqual({
      windowId: 'window-1',
      visible: true,
      width: 240,
    });
    const mutation = createDesktopApplicationSidebarMutationRequest({
      requestId: 'request-1',
      rendererSessionId: 'endpoint-1',
      windowId: 'window-1',
      visible: false,
      width: 288,
    });
    expect(mutation).toEqual({
      requestId: 'request-1',
      rendererSessionId: 'endpoint-1',
      windowId: 'window-1',
      visible: false,
      width: 288,
    });
    expect(
      applyDesktopApplicationSidebarMutation({
        projection: sidebar,
        request: mutation,
        rendererSessionId: 'endpoint-1',
      }),
    ).toEqual({ ...sidebar, visible: false, width: 288 });
    expect(() =>
      applyDesktopApplicationSidebarMutation({
        projection: sidebar,
        request: mutation,
        rendererSessionId: 'endpoint-2',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopSceneContractError>>({
        code: 'desktop-scene-stale-identity',
      }),
    );
    expect(() =>
      parseDesktopApplicationSidebarProjection({
        ...createDefaultDesktopApplicationSidebar('window-1'),
        width: 900,
      }),
    ).toThrow('Desktop Sidebar width must be between 208 and 360');
    expect(() =>
      parseDesktopApplicationSidebarMutationRequest({
        requestId: 'request-1',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        unexpectedField: 1,
        visible: true,
        width: 240,
      }),
    ).toThrow("Desktop Sidebar mutation request contains unknown field 'unexpectedField'");
  });
});

function workspaceScene() {
  return {
    sceneId: 'scene:window-1:workspace-1',
    windowId: 'window-1',
    context: {
      kind: 'agent' as const,
      agentViewId: 'agent-view:window-1',
      scope: {
        kind: 'workspace' as const,
        draftId: 'draft-1',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        conversationId: 'conversation-1',
      },
    },
    slots: {
      interaction: {
        kind: 'agent' as const,
        agentSurfaceId: 'agent-surface:window-1',
        agentViewId: 'agent-view:window-1',
        phase: 'session' as const,
        scope: {
          kind: 'workspace' as const,
          draftId: 'draft-1',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          conversationId: 'conversation-1',
        },
      },
      main: {
        kind: 'workspace-main' as const,
        workspaceId: 'workspace-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-3',
      },
      rightManager: { kind: 'workspace-resources' as const, workspaceId: 'workspace-1' },
      cutPanel: {
        kind: 'workspace-cut' as const,
        workspaceId: 'workspace-1',
        viewId: 'cut-1',
        viewInstanceId: 'view-instance-3',
        ownerId: 'cut-owner-1',
      },
      status: { kind: 'scene-status' as const, sceneId: 'scene:window-1:workspace-1' },
    },
  };
}

function characterRoomScene() {
  const sceneId = 'scene:window-1:character-interaction:conversation-room-1';
  const owner = { kind: 'room' as const, roomId: 'room-1', roomRunId: 'room-run-1' };
  const scope = {
    kind: 'assistant' as const,
    draftId: 'draft-room-1',
    assistantSpaceId: 'assistant-space:user',
    conversationId: 'conversation-room-1',
  };
  return {
    sceneId,
    windowId: 'window-1',
    context: {
      kind: 'character-interaction' as const,
      agentViewId: 'agent-view-room-1',
      owner,
      scope,
    },
    slots: {
      interaction: {
        kind: 'agent' as const,
        agentSurfaceId: 'agent-surface-room-1',
        agentViewId: 'agent-view-room-1',
        phase: 'session' as const,
        scope,
      },
      main: {
        kind: 'character-presentation' as const,
        owner,
        surfaceKind: 'avatar' as const,
        providerId: 'chara.representation',
        surfaceId: 'character-presentation:conversation-room-1',
      },
      rightManager: { kind: 'character-runtime-manager' as const, owner },
      cutPanel: {
        kind: 'character-timeline-stack' as const,
        owner,
        timelines: [
          {
            kind: 'character-storyline-timeline' as const,
            owner,
            timelineId: 'storyline-timeline:conversation-room-1',
          },
          {
            kind: 'character-room-event-timeline' as const,
            owner,
            timelineId: 'room-event-timeline:conversation-room-1',
          },
        ],
      },
      status: { kind: 'scene-status' as const, sceneId },
    },
  };
}

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

  it('keeps management Roots in Main instead of manager docks', () => {
    const sceneId = 'scene:window-1:extensions';
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: {
        kind: 'extensions' as const,
      },
      slots: {
        main: {
          kind: 'extension-management' as const,
        },
        secondaryMain: { kind: 'extension-detail' as const },
        status: { kind: 'scene-status' as const, sceneId },
      },
    };
    expect(parseDesktopWorkbenchSceneProjection(projection)).toEqual(projection);
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: {
          leftManager: {
            kind: 'extension-catalog',
          },
          status: projection.slots.status,
        },
      }),
    ).toThrow("Unknown Manager Surface kind 'extension-catalog'");
  });

  it('owns Character Management catalog and exact detail as one Window scene', () => {
    const sceneId = 'scene:window-1:character-management';
    const detail = { kind: 'project' as const, characterProjectId: 'character-project:lin' };
    const projection = {
      sceneId,
      windowId: 'window-1',
      context: { kind: 'character-management' as const, detail },
      slots: {
        main: { kind: 'character-management' as const },
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
        intent: { kind: 'open-character-management' },
      }).intent,
    ).toEqual({ kind: 'open-character-management' });
    expect(
      parseDesktopSceneTransitionRequest({
        requestId: 'request-character-detail',
        rendererSessionId: 'endpoint-1',
        windowId: 'window-1',
        sceneId,
        intent: { kind: 'select-character-detail', selection: { kind: 'create' } },
      }).intent,
    ).toEqual({ kind: 'select-character-detail', selection: { kind: 'create' } });
    expect(() =>
      parseDesktopWorkbenchSceneProjection({
        ...projection,
        slots: { main: { kind: 'project-management' }, status: projection.slots.status },
      }),
    ).toThrow("Main Surface 'project-management' is not valid for this Scene");
  });

  it('creates exact Scene identity transition requests and rejects arbitrary intent', () => {
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

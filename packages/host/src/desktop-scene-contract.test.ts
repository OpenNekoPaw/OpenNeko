import { describe, expect, it } from 'vitest';
import {
  DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
  DESKTOP_SCENE_CONTRACT_VERSION,
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
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId: 'scene:window-1:agent:draft-1',
      windowId: 'window-1',
      revision: 0,
      context: {
        kind: 'agent',
        agentViewId: 'agent-view:window-1:draft-1',
        scope: { kind: 'unbound', draftId: 'draft-1' },
      },
      slots: {
        interaction: {
          kind: 'agent',
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
            viewEpoch: 1,
          },
        },
      }),
    ).toThrow('Assistant Scene Main Surface');
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
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId: 'scene:window-1:assets',
      windowId: 'window-1',
      revision: 2,
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
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId: 'window-1',
      revision: 1,
      context: {
        kind: 'extensions' as const,
        extensionManagementSessionId: 'extension-management-1',
      },
      slots: {
        main: {
          kind: 'extension-management' as const,
          extensionManagementSessionId: 'extension-management-1',
        },
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
            extensionManagementSessionId: 'extension-management-1',
          },
          status: projection.slots.status,
        },
      }),
    ).toThrow("Unknown Manager Surface kind 'extension-catalog'");
  });

  it('creates revision-fenced transition requests and rejects arbitrary intent', () => {
    expect(
      createDesktopSceneTransitionRequest({
        requestId: 'request-1',
        expectedEndpointEpoch: 'endpoint-1',
        windowId: 'window-1',
        expectedWindowRevision: 4,
        expectedSceneRevision: 2,
        intent: { kind: 'open-workspace', workspaceGrantId: 'grant-1' },
      }),
    ).toEqual({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      requestId: 'request-1',
      expectedEndpointEpoch: 'endpoint-1',
      windowId: 'window-1',
      expectedWindowRevision: 4,
      expectedSceneRevision: 2,
      intent: { kind: 'open-workspace', workspaceGrantId: 'grant-1' },
    });
    expect(
      createDesktopSceneTransitionRequest({
        requestId: 'request-project',
        expectedEndpointEpoch: 'endpoint-1',
        windowId: 'window-1',
        expectedWindowRevision: 4,
        expectedSceneRevision: 2,
        intent: { kind: 'open-project-workspace', projectId: 'project-1' },
      }).intent,
    ).toEqual({ kind: 'open-project-workspace', projectId: 'project-1' });
    expect(
      createDesktopSceneTransitionRequest({
        requestId: 'request-conversation',
        expectedEndpointEpoch: 'endpoint-1',
        windowId: 'window-1',
        expectedWindowRevision: 4,
        expectedSceneRevision: 2,
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
        schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
        requestId: 'request-legacy-conversation',
        expectedEndpointEpoch: 'endpoint-1',
        windowId: 'window-1',
        expectedWindowRevision: 4,
        expectedSceneRevision: 2,
        intent: { kind: 'restore-conversation', conversationId: 'conversation-1' },
      }),
    ).toThrow("Restore Conversation intent contains unknown field 'conversationId'");
    expect(() =>
      parseDesktopSceneTransitionRequest({
        schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
        requestId: 'request-1',
        expectedEndpointEpoch: 'endpoint-1',
        windowId: 'window-1',
        expectedWindowRevision: 4,
        expectedSceneRevision: 2,
        intent: { kind: 'open-home' },
      }),
    ).toThrow("Unknown Desktop Scene transition intent 'open-home'");
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

  it('validates an independent Sidebar projection and mutation revision', () => {
    const sidebar = createDefaultDesktopApplicationSidebar('window-1');
    expect(sidebar).toEqual({
      schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
      windowId: 'window-1',
      revision: 0,
      visible: true,
      width: 240,
    });
    const mutation = createDesktopApplicationSidebarMutationRequest({
      requestId: 'request-1',
      expectedEndpointEpoch: 'endpoint-1',
      windowId: 'window-1',
      expectedSidebarRevision: 3,
      visible: false,
      width: 288,
    });
    expect(mutation).toEqual({
      schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
      requestId: 'request-1',
      expectedEndpointEpoch: 'endpoint-1',
      windowId: 'window-1',
      expectedSidebarRevision: 3,
      visible: false,
      width: 288,
    });
    expect(
      applyDesktopApplicationSidebarMutation({
        projection: { ...sidebar, revision: 3 },
        request: mutation,
        endpointEpoch: 'endpoint-1',
      }),
    ).toEqual({ ...sidebar, revision: 4, visible: false, width: 288 });
    expect(() =>
      applyDesktopApplicationSidebarMutation({
        projection: sidebar,
        request: mutation,
        endpointEpoch: 'endpoint-1',
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
        schemaVersion: DESKTOP_APPLICATION_SIDEBAR_CONTRACT_VERSION,
        requestId: 'request-1',
        expectedEndpointEpoch: 'endpoint-1',
        windowId: 'window-1',
        expectedSidebarRevision: -1,
        visible: true,
        width: 240,
      }),
    ).toThrow('Desktop Sidebar revision must be a non-negative integer');
  });
});

function workspaceScene() {
  return {
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId: 'scene:window-1:workspace-1',
    windowId: 'window-1',
    revision: 1,
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
        viewEpoch: 3,
      },
      rightManager: { kind: 'workspace-resources' as const, workspaceId: 'workspace-1' },
      timeline: {
        kind: 'workspace-timeline' as const,
        workspaceId: 'workspace-1',
        viewId: 'view-1',
        viewEpoch: 3,
        ownerId: 'cut-1',
      },
      status: { kind: 'scene-status' as const, sceneId: 'scene:window-1:workspace-1' },
    },
  };
}

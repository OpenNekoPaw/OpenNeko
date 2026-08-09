import { describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import { createOpenNekoPiModels } from '@neko/agent-runtime/pi';
import type {
  AgentHostToWebviewMessage,
  DesktopAgentConnectionIdentity,
} from '@neko/agent-contracts';
import {
  createDesktopAgentMessageRequest,
  DesktopAgentContractError,
} from '../shared/agent-contract';
import type {
  AgentControllerComposition,
  AgentControllerEffects,
  AgentWorkspaceRuntime,
} from '@neko/agent-runtime/application';
import {
  auditDesktopAgentStartup,
  createDesktopAgentBridgeRuntime,
  type DesktopAgentConnectionGrant,
  type DesktopAssistantAgentConnectionGrant,
} from './desktop-agent-bridge-runtime';

describe('Desktop Agent bridge runtime', () => {
  it('keeps startup unavailable when the complete effect composition is absent', () => {
    expect(auditDesktopAgentStartup()).toEqual({
      ready: false,
      diagnostic: expect.objectContaining({
        code: 'desktop-agent-capability-unavailable',
        missingRequirements: [
          'conversation-effects',
          'config-effects',
          'skill-effects',
          'content-effects',
          'projection-effects',
        ],
      }),
    });
  });

  it('reports every missing runtime/effect requirement instead of starting partially', () => {
    expect(
      auditDesktopAgentStartup(
        {
          requirements: {
            'conversation-effects': true,
          },
          createEffects: () => createEffects(),
          resolveExternalOwnerTurnRuntime: vi.fn(async () => {
            throw new Error('Character runtime resolution is not used by this fixture.');
          }),
        },
        false,
      ),
    ).toEqual({
      ready: false,
      diagnostic: expect.objectContaining({
        missingRequirements: [
          'pi-runtime',
          'config-effects',
          'skill-effects',
          'content-effects',
          'projection-effects',
        ],
      }),
    });
  });

  it('routes an implemented message through the shared controller', async () => {
    const effects = createEffects();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: createComposition(effects),
      createIdentity: () => 'connection-1',
    });
    const projection = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Agent bootstrap.');

    expect(() => runtime.assertConnection(projection.connection, grant())).not.toThrow();
    expect(() =>
      runtime.assertConnection(
        { ...projection.connection, connectionId: 'forged-connection' },
        grant(),
      ),
    ).toThrow("Unknown Desktop Agent connection 'forged-connection'");

    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-1', projection.connection, {
          type: 'getConversations',
        }),
        grant(),
      ),
    ).resolves.toEqual({
      requestId: 'message-1',
      status: 'accepted',
    });
    expect(effects.conversation.listConversations).toHaveBeenCalledOnce();
  });

  it('routes an Assistant session through the same controller without a synthetic Project grant', async () => {
    const effects = createEffects();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: createComposition(effects),
      createIdentity: () => 'assistant-connection-1',
    });
    const projection = runtime.createBootstrap({
      requestId: 'assistant-bootstrap-1',
      grant: assistantGrant(),
      workspace: workspace('assistant-space:local-user'),
      publish: vi.fn(),
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Assistant bootstrap.');

    expect(projection.connection).toMatchObject({
      assistantSpaceId: 'assistant-space:local-user',
      workspaceId: 'assistant-space:local-user',
      connectionId: 'assistant-connection-1',
    });
    expect(JSON.stringify(projection.connection)).not.toContain('projectId');
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('assistant-message-1', projection.connection, {
          type: 'getConversations',
        }),
        assistantGrant(),
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
    expect(effects.conversation.listConversations).toHaveBeenCalledOnce();
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('assistant-message-wrong-owner', projection.connection, {
          type: 'getConversations',
        }),
        {
          applicationInstanceId: 'app-1',
          windowId: 'window-1',
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'agent-surface-1',
          projectId: 'project-forbidden',
          workspaceId: 'assistant-space:local-user',
          viewId: 'agent-view:window-1',
        },
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
  });

  it('passes the persisted initial user message into the exact session effects owner', () => {
    const effects = createEffects();
    const createEffectsForSession = vi.fn(() => effects);
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: {
        ...createComposition(effects),
        createEffects: createEffectsForSession,
      },
      createIdentity: () => 'assistant-connection-initial-message',
    });
    const initialConversationMessage = {
      id: 'message-initial-1',
      role: 'user' as const,
      content: 'retain this prompt',
      timestamp: Date.parse('2026-08-03T00:00:00.000Z'),
    };

    runtime.createBootstrap({
      requestId: 'assistant-bootstrap-initial-message',
      grant: assistantGrant(),
      workspace: workspace('assistant-space:local-user'),
      initialConversationId: 'conversation-1',
      initialConversationMessage,
      publish: vi.fn(),
    });

    expect(createEffectsForSession).toHaveBeenCalledWith(
      expect.objectContaining({
        initialConversationId: 'conversation-1',
        initialConversationMessage,
      }),
    );
  });

  it('returns the exhaustive typed diagnostic for unsupported routes', async () => {
    const runtime = createReadyRuntime();
    const projection = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Agent bootstrap.');

    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-1', projection.connection, {
          type: 'sendToPlugin',
          target: 'neko.neko-canvas',
          assetPath: 'fixture.png',
        }),
        grant(),
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        code: 'agent-host-route-unsupported',
        messageType: 'sendToPlugin',
        owner: 'Phase 3',
      },
    });
  });

  it('injects context only into the exact project/workspace connection', async () => {
    const effects = createEffects();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: createComposition(effects),
      createIdentity: () => 'connection-1',
    });
    runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    const payload = {
      type: 'cut-clip' as const,
      id: 'cut:clip-1',
      label: 'Clip 1',
      summary: 'Explicit Cut Clip',
      data: { documentId: 'project.otio', clipId: 'clip-1' },
    };

    await expect(
      runtime.injectContext({
        windowId: 'window-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        payload,
      }),
    ).resolves.toBeUndefined();
    expect(effects.injectContext).toHaveBeenCalledWith(payload);

    await expect(
      runtime.injectContext({
        windowId: 'window-1',
        projectId: 'project-forged',
        workspaceId: 'workspace-1',
        payload,
      }),
    ).rejects.toThrow('found 0');
    expect(effects.injectContext).toHaveBeenCalledOnce();
  });

  it('rejects forged owner and connection identities before effects', async () => {
    const effects = createEffects();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: createComposition(effects),
      createIdentity: () => 'connection-1',
    });
    const projection = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Agent bootstrap.');

    const cases: readonly {
      readonly connection: DesktopAgentConnectionIdentity;
      readonly expectedCode: DesktopAgentContractError['code'];
    }[] = [
      {
        connection: { ...projection.connection, workspaceId: 'workspace-forged' },
        expectedCode: 'desktop-agent-identity-mismatch',
      },
      {
        connection: { ...projection.connection, connectionId: 'connection-forged' },
        expectedCode: 'desktop-agent-identity-mismatch',
      },
    ];
    for (const fixture of cases) {
      await expect(
        runtime.send(
          createDesktopAgentMessageRequest('message-1', fixture.connection, {
            type: 'getConversations',
          }),
          grant(),
        ),
      ).rejects.toMatchObject({ code: fixture.expectedCode });
    }
    expect(effects.conversation.listConversations).not.toHaveBeenCalled();
  });

  it('reuses and reference-counts the exact connection when StrictMode repeats bootstrap', async () => {
    let nextIdentity = 0;
    const firstEffects = createEffects();
    const duplicateEffects = createEffects();
    const createEffectsForConnection = vi
      .fn()
      .mockReturnValueOnce(firstEffects)
      .mockReturnValueOnce(duplicateEffects);
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: {
        ...createComposition(firstEffects),
        createEffects: createEffectsForConnection,
      },
      createIdentity: () => `connection-${++nextIdentity}`,
    });
    const first = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    const second = runtime.createBootstrap({
      requestId: 'bootstrap-2',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('Expected ready Agent bootstraps.');
    }
    expect(second.connection).toEqual(first.connection);
    expect(createEffectsForConnection).toHaveBeenCalledOnce();
    expect(firstEffects.dispose).not.toHaveBeenCalled();
    expect(duplicateEffects.dispose).not.toHaveBeenCalled();

    runtime.detachConnection(first.connection, {
      applicationInstanceId: first.connection.applicationInstanceId,
      windowId: first.connection.windowId,
    });
    expect(firstEffects.dispose).not.toHaveBeenCalled();

    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', first.connection, {
          type: 'getConversations',
        }),
        grant(),
      ),
    ).resolves.toMatchObject({ status: 'accepted' });

    runtime.detachConnection(second.connection, {
      applicationInstanceId: second.connection.applicationInstanceId,
      windowId: second.connection.windowId,
    });
    expect(firstEffects.dispose).toHaveBeenCalledOnce();
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-detached', second.connection, {
          type: 'getConversations',
        }),
        grant(),
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
  });

  it('detaches only the exact sender-bound connection and preserves its sibling', async () => {
    let nextIdentity = 0;
    const firstEffects = createEffects();
    const siblingEffects = createEffects();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: {
        ...createComposition(firstEffects),
        createEffects: vi
          .fn()
          .mockReturnValueOnce(firstEffects)
          .mockReturnValueOnce(siblingEffects),
      },
      createIdentity: () => `connection-${++nextIdentity}`,
    });
    const firstGrant = grant();
    const siblingGrant = { ...firstGrant, agentSurfaceId: 'agent-surface-2' };
    const firstPublish = vi.fn();
    const first = runtime.createBootstrap({
      requestId: 'bootstrap-first',
      grant: firstGrant,
      workspace: workspace(),
      publish: firstPublish,
    });
    const sibling = runtime.createBootstrap({
      requestId: 'bootstrap-sibling',
      grant: siblingGrant,
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (first.status !== 'ready' || sibling.status !== 'ready') {
      throw new Error('Expected ready Agent bootstraps.');
    }

    expect(() =>
      runtime.detachConnection(
        { ...first.connection, workspaceId: 'workspace-forged' },
        {
          applicationInstanceId: first.connection.applicationInstanceId,
          windowId: first.connection.windowId,
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'desktop-agent-identity-mismatch' }));
    expect(() =>
      runtime.detachConnection(first.connection, {
        applicationInstanceId: first.connection.applicationInstanceId,
        windowId: 'window-forged',
      }),
    ).toThrow(expect.objectContaining({ code: 'desktop-agent-identity-mismatch' }));
    expect(firstEffects.dispose).not.toHaveBeenCalled();

    runtime.detachConnection(first.connection, {
      applicationInstanceId: first.connection.applicationInstanceId,
      windowId: first.connection.windowId,
    });

    expect(firstEffects.dispose).toHaveBeenCalledOnce();
    expect(firstPublish).toHaveBeenCalledWith({
      connection: first.connection,
      sequence: 1,
      status: 'detached',
    });
    expect(siblingEffects.dispose).not.toHaveBeenCalled();
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('sibling-message', sibling.connection, {
          type: 'getConversations',
        }),
        siblingGrant,
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('stops connection event publication before background effects finish', async () => {
    const effects = createEffects();
    let latePost: ((message: AgentHostToWebviewMessage) => void | Promise<void>) | undefined;
    vi.mocked(effects.conversation.listConversations).mockImplementation((context) => {
      latePost = context.post;
    });
    const publish = vi.fn();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: createComposition(effects),
      createIdentity: () => 'connection-background',
    });
    const projection = runtime.createBootstrap({
      requestId: 'bootstrap-background',
      grant: grant(),
      workspace: workspace(),
      publish,
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Agent bootstrap.');
    await runtime.send(
      createDesktopAgentMessageRequest('message-background', projection.connection, {
        type: 'getConversations',
      }),
      grant(),
    );
    if (!latePost) throw new Error('Expected the controller post port to be captured.');

    runtime.detachConnection(projection.connection, {
      applicationInstanceId: projection.connection.applicationInstanceId,
      windowId: projection.connection.windowId,
    });
    await latePost({ type: 'globalError', message: 'late background projection' });

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith({
      connection: projection.connection,
      sequence: 1,
      status: 'detached',
    });
  });

  it('keeps exact Workspace View connections when their bootstrap Conversations differ', async () => {
    let nextIdentity = 0;
    const firstEffects = createEffects();
    const nextEffects = createEffects();
    const createEffectsForConnection = vi
      .fn()
      .mockReturnValueOnce(firstEffects)
      .mockReturnValueOnce(nextEffects);
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: {
        ...createComposition(firstEffects),
        createEffects: createEffectsForConnection,
      },
      createIdentity: () => `connection-${++nextIdentity}`,
    });
    const firstGrant = grant();
    const nextGrant = { ...firstGrant, agentSurfaceId: 'agent-surface-2' };
    const first = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: firstGrant,
      workspace: workspace(),
      initialConversationId: 'conversation-1',
      publish: vi.fn(),
    });
    const next = runtime.createBootstrap({
      requestId: 'bootstrap-2',
      grant: nextGrant,
      workspace: workspace(),
      initialConversationId: 'conversation-2',
      publish: vi.fn(),
    });
    if (first.status !== 'ready' || next.status !== 'ready') {
      throw new Error('Expected ready Agent bootstraps.');
    }

    expect(next.connection.connectionId).not.toBe(first.connection.connectionId);
    expect(createEffectsForConnection).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ initialConversationId: 'conversation-1' }),
    );
    expect(createEffectsForConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ initialConversationId: 'conversation-2' }),
    );
    expect(firstEffects.dispose).not.toHaveBeenCalled();
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-stale', first.connection, {
          type: 'getConversations',
        }),
        firstGrant,
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', next.connection, {
          type: 'getConversations',
        }),
        nextGrant,
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('replaces the connection after its owning Window detaches', async () => {
    let nextIdentity = 0;
    const firstEffects = createEffects();
    const nextEffects = createEffects();
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: {
        ...createComposition(firstEffects),
        createEffects: vi.fn().mockReturnValueOnce(firstEffects).mockReturnValueOnce(nextEffects),
      },
      createIdentity: () => `connection-${++nextIdentity}`,
    });
    const firstGrant = grant();
    const first = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: firstGrant,
      workspace: workspace(),
      publish: vi.fn(),
    });
    runtime.detachWindow(firstGrant.windowId);
    const next = runtime.createBootstrap({
      requestId: 'bootstrap-2',
      grant: firstGrant,
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (first.status !== 'ready' || next.status !== 'ready') {
      throw new Error('Expected ready Agent bootstraps.');
    }

    expect(next.connection.connectionId).not.toBe(first.connection.connectionId);
    expect(firstEffects.dispose).toHaveBeenCalledOnce();
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-stale', first.connection, {
          type: 'getConversations',
        }),
        firstGrant,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', next.connection, {
          type: 'getConversations',
        }),
        firstGrant,
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('detaches only the exact Window connections and disposes their effect subscriptions', async () => {
    let nextIdentity = 0;
    const firstEffects = createEffects();
    const secondEffects = createEffects();
    let effectsIndex = 0;
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: {
        ...createComposition(firstEffects),
        createEffects: () => {
          effectsIndex += 1;
          return effectsIndex === 1 ? firstEffects : secondEffects;
        },
      },
      createIdentity: () => `connection-${++nextIdentity}`,
    });
    const firstGrant = grant();
    const secondGrant = {
      ...grant(),
      windowId: 'window-2',
      viewId: 'view-2',
    };
    const first = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: firstGrant,
      workspace: workspace(),
      publish: vi.fn(),
    });
    const second = runtime.createBootstrap({
      requestId: 'bootstrap-2',
      grant: secondGrant,
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('Expected ready Agent bootstraps.');
    }

    runtime.detachWindow(firstGrant.windowId);

    expect(firstEffects.dispose).toHaveBeenCalledOnce();
    expect(secondEffects.dispose).not.toHaveBeenCalled();
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-old', first.connection, {
          type: 'getConversations',
        }),
        firstGrant,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', second.connection, {
          type: 'getConversations',
        }),
        secondGrant,
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('runs terminal-idle only through exact connection-owned automation effects', async () => {
    const waitForIdle = vi.fn(async () => ({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    }));
    const effects = createEffects({
      waitForIdle,
      readLatestTurnIdentity: () => undefined,
      readFacts: () => {
        throw new Error('Facts read is not expected.');
      },
      disposeAndReadFacts: async () => {
        throw new Error('Facts disposal is not expected.');
      },
    });
    const runtime = createDesktopAgentBridgeRuntime({
      controllerComposition: createComposition(effects),
      createIdentity: () => 'connection-1',
    });
    const projection = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: grant(),
      workspace: workspace(),
      publish: vi.fn(),
    });
    if (projection.status !== 'ready') throw new Error('Expected a ready Agent bootstrap.');

    await expect(
      runtime.waitForIdle(projection.connection, grant(), 'conversation-1', 30_000),
    ).resolves.toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    });
    expect(waitForIdle).toHaveBeenCalledWith('conversation-1', 30_000, undefined);
    expect(() =>
      runtime.waitForIdle(
        projection.connection,
        { ...grant(), workspaceId: 'workspace-forged' },
        'conversation-1',
        30_000,
      ),
    ).toThrow(expect.objectContaining({ code: 'desktop-agent-identity-mismatch' }));
  });
});

function createReadyRuntime() {
  return createDesktopAgentBridgeRuntime({
    controllerComposition: createComposition(createEffects()),
    createIdentity: () => 'connection-1',
  });
}

function createComposition(effects: AgentControllerEffects): AgentControllerComposition {
  return {
    requirements: {
      'pi-runtime': true,
      'conversation-effects': true,
      'config-effects': true,
      'skill-effects': true,
      'content-effects': true,
      'projection-effects': true,
    },
    createEffects: () => effects,
    resolveExternalOwnerTurnRuntime: vi.fn(async () => {
      throw new Error('Character runtime resolution is not used by this fixture.');
    }),
  };
}

function createEffects(
  automation?: NonNullable<AgentControllerEffects['automation']>,
): AgentControllerEffects {
  return {
    dispose: vi.fn(),
    injectContext: vi.fn(),
    ...(automation === undefined ? {} : { automation }),
    conversation: {
      submitTurn: vi.fn(),
      confirmTool: vi.fn(),
      cancelTurn: vi.fn(),
      activateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      listConversations: vi.fn(),
      readActiveConversation: vi.fn(),
      readAgentStates: vi.fn(),
      readConversationSnapshot: vi.fn(),
      readMessageQueue: vi.fn(),
      promoteQueuedMessage: vi.fn(),
      cancelQueuedMessage: vi.fn(),
      editQueuedMessage: vi.fn(),
      clearHistory: vi.fn(),
      clearAllConversations: vi.fn(),
    },
    config: {
      readSettings: vi.fn(),
      readConfig: vi.fn(),
      refreshConfig: vi.fn(),
      openUserConfig: vi.fn(),
      readTabState: vi.fn(),
      updateSettings: vi.fn(),
      updateTabState: vi.fn(),
    },
    skill: {
      listSkills: vi.fn(),
      invokeSlashCommand: vi.fn(),
      invokeSkill: vi.fn(),
      readContextTokenCount: vi.fn(),
      compressContext: vi.fn(),
    },
    content: {
      searchProjectFiles: vi.fn(),
      openFile: vi.fn(),
      revealDocumentLocator: vi.fn(),
      revealFile: vi.fn(),
      openExternalUrl: vi.fn(),
      revealContextSource: vi.fn(),
      downloadSvg: vi.fn(),
    },
    projection: {
      discoverEndpoint: vi.fn(),
      attach: vi.fn(),
      acknowledge: vi.fn(),
      detach: vi.fn(),
    },
  };
}

function grant(): DesktopAgentConnectionGrant {
  return {
    applicationInstanceId: 'app-1',
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: 'agent-surface-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
  };
}

function workspace(workspaceId = 'workspace-1'): AgentWorkspaceRuntime {
  return {
    workspaceId,
    workspace: {
      workspaceId,
      workspacePath: '/workspace/demo',
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    },
    models: createOpenNekoPiModels({
      read: async () => undefined,
      modify: async (_providerId, operation) => operation(undefined),
      delete: async () => undefined,
    }),
    tools: createToolRegistry(),
    createConversation: vi.fn(),
    ensureConversation: vi.fn(),
    checkpointFailedInitialTurn: vi.fn(),
    deleteConversation: vi.fn(),
    clearAllConversations: vi.fn(),
    openConversation: vi.fn(),
    startTurn: vi.fn(),
    executeTurn: vi.fn(),
    readMessageQueue: vi.fn(),
    promoteQueuedMessage: vi.fn(),
    cancelQueuedMessage: vi.fn(),
    takeQueuedMessageForEdit: vi.fn(),
    clearMessageQueue: vi.fn(),
    cancelTurn: vi.fn(),
    readActiveTurn: vi.fn(),
    readConversationEntries: vi.fn(),
    readContextTokenCount: vi.fn(),
    clearContext: vi.fn(),
    compactContext: vi.fn(),
    readSkillCatalog: vi.fn(),
    readCapabilityPromptFragments: () => [],
    listConversations: vi.fn(() => []),
    readConversationEvidence: vi.fn(),
    readConversationProjection: vi.fn(),
    subscribeConversationProjection: vi.fn(),
    bindVisiblePresentation: vi.fn(),
    protectConversationRuntime: vi.fn(),
    readRuntimeResidency: vi.fn(() => ({
      workspaceId,
      visibleBindingCount: 0,
      releaseRequested: false,
      releasable: false,
      conversations: [],
    })),
    dispose: vi.fn(),
  };
}

function assistantGrant(): DesktopAssistantAgentConnectionGrant {
  return {
    applicationInstanceId: 'app-1',
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-assistant-1',
    agentSurfaceId: 'agent-surface-assistant-1',
    assistantSpaceId: 'assistant-space:local-user',
    workspaceId: 'assistant-space:local-user',
    viewId: 'agent-view:window-1',
  };
}

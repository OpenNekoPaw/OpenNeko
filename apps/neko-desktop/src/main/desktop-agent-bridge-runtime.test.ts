import { describe, expect, it, vi } from 'vitest';
import { createToolRegistry } from '@neko/agent/tool-registry';
import { createOpenNekoPiModels } from '@neko/agent/pi';
import {
  createDesktopAgentMessageRequest,
  DesktopAgentContractError,
  type DesktopAgentConnectionIdentity,
} from '../shared/agent-contract';
import type { DesktopAgentWorkspaceRuntime } from './desktop-agent-app-host-composition';
import {
  auditDesktopAgentStartup,
  createDesktopAgentBridgeRuntime,
  type DesktopAgentConnectionGrant,
  type DesktopAgentControllerComposition,
  type DesktopAgentControllerEffects,
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

    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-1', projection.connection, {
          type: 'newConversation',
        }),
        grant(),
      ),
    ).resolves.toEqual({
      schemaVersion: 1,
      requestId: 'message-1',
      status: 'accepted',
    });
    expect(effects.conversation.createConversation).toHaveBeenCalledOnce();
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

  it('rejects forged owner identity and stale renderer/View epochs before effects', async () => {
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
        connection: { ...projection.connection, rendererEpoch: 1 },
        expectedCode: 'desktop-agent-stale-renderer-epoch',
      },
      {
        connection: { ...projection.connection, viewEpoch: 1 },
        expectedCode: 'desktop-agent-stale-view-epoch',
      },
    ];
    for (const fixture of cases) {
      await expect(
        runtime.send(
          createDesktopAgentMessageRequest('message-1', fixture.connection, {
            type: 'newConversation',
          }),
          grant(),
        ),
      ).rejects.toMatchObject({ code: fixture.expectedCode });
    }
    expect(effects.conversation.createConversation).not.toHaveBeenCalled();
  });

  it('reuses the exact connection when StrictMode repeats bootstrap for the same owner epoch', async () => {
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

    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', first.connection, {
          type: 'newConversation',
        }),
        grant(),
      ),
    ).resolves.toMatchObject({ status: 'accepted' });
  });

  it('replaces the connection when the renderer epoch advances', async () => {
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
    const nextGrant = { ...firstGrant, rendererEpoch: firstGrant.rendererEpoch + 1 };
    const first = runtime.createBootstrap({
      requestId: 'bootstrap-1',
      grant: firstGrant,
      workspace: workspace(),
      publish: vi.fn(),
    });
    const next = runtime.createBootstrap({
      requestId: 'bootstrap-2',
      grant: nextGrant,
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
          type: 'newConversation',
        }),
        firstGrant,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', next.connection, {
          type: 'newConversation',
        }),
        nextGrant,
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
          type: 'newConversation',
        }),
        firstGrant,
      ),
    ).rejects.toMatchObject({ code: 'desktop-agent-identity-mismatch' });
    await expect(
      runtime.send(
        createDesktopAgentMessageRequest('message-current', second.connection, {
          type: 'newConversation',
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
    expect(waitForIdle).toHaveBeenCalledWith('conversation-1', 30_000);
    expect(() =>
      runtime.waitForIdle(
        projection.connection,
        { ...grant(), rendererEpoch: grant().rendererEpoch + 1 },
        'conversation-1',
        30_000,
      ),
    ).toThrow(expect.objectContaining({ code: 'desktop-agent-stale-renderer-epoch' }));
  });
});

function createReadyRuntime() {
  return createDesktopAgentBridgeRuntime({
    controllerComposition: createComposition(createEffects()),
    createIdentity: () => 'connection-1',
  });
}

function createComposition(
  effects: DesktopAgentControllerEffects,
): DesktopAgentControllerComposition {
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
  };
}

function createEffects(
  automation?: NonNullable<DesktopAgentControllerEffects['automation']>,
): DesktopAgentControllerEffects {
  return {
    dispose: vi.fn(),
    ...(automation === undefined ? {} : { automation }),
    conversation: {
      submitTurn: vi.fn(),
      confirmTool: vi.fn(),
      cancelTurn: vi.fn(),
      createConversation: vi.fn(),
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
      openHostConfig: vi.fn(),
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
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    viewEpoch: 2,
    rendererEpoch: 2,
  };
}

function workspace(): DesktopAgentWorkspaceRuntime {
  return {
    workspaceId: 'workspace-1',
    workspace: {
      workspaceId: 'workspace-1',
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
    deleteConversation: vi.fn(),
    clearAllConversations: vi.fn(),
    openConversation: vi.fn(),
    startTurn: vi.fn(),
    executeTurn: vi.fn(),
    cancelTurn: vi.fn(),
    readActiveTurn: vi.fn(),
    readConversationEntries: vi.fn(),
    readContextTokenCount: vi.fn(),
    clearContext: vi.fn(),
    compactContext: vi.fn(),
    readSkillCatalog: vi.fn(),
    listConversations: vi.fn(() => []),
    readConversationEvidence: vi.fn(),
    readConversationProjection: vi.fn(),
    subscribeConversationProjection: vi.fn(),
    dispose: vi.fn(),
  };
}

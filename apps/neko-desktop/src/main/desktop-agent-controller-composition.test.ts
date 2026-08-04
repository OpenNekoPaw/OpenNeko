import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenNekoPiModels } from '@neko/agent-runtime/pi';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import type {
  AgentHostToWebviewMessage,
  AgentTurnTimelineToolCallItem,
  ConversationProjectionSnapshot,
} from '@neko/agent-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentWorkspaceRuntime } from '@neko/agent-runtime/application';
import { auditDesktopAgentStartup } from './desktop-agent-bridge-runtime';
import {
  createAgentControllerComposition,
  projectAgentSecretSafeConfig,
} from '@neko/agent-runtime/application';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Agent controller composition', () => {
  it('checkpoints the initial message when provider preflight fails before a Pi turn starts', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-1');
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError: vi.fn(),
    });

    await expect(
      composition.startInitialTurn?.({
        workspace,
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        messageText: 'retain this prompt',
        providerId: 'provider-missing',
        modelId: 'model-missing',
        locale: 'en',
      }),
    ).rejects.toThrow('Effective Agent configuration is blocked: missingConfig');
    expect(workspace.checkpointFailedInitialTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      messageText: 'retain this prompt',
    });
    await composition.dispose?.();
  });

  it('keeps the initial-turn application port bound across a composition boundary', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-bound-port');
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError: vi.fn(),
    });
    const startInitialTurn = composition.startInitialTurn;
    if (!startInitialTurn) throw new Error('Initial-turn application port is unavailable.');

    await expect(
      startInitialTurn({
        workspace,
        conversationId: 'conversation-bound-port',
        turnId: 'turn-bound-port',
        messageText: 'retain this prompt',
        providerId: 'provider-missing',
        modelId: 'model-missing',
        locale: 'en',
      }),
    ).rejects.toThrow('Effective Agent configuration is blocked: missingConfig');
    expect(workspace.checkpointFailedInitialTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-bound-port',
      turnId: 'turn-bound-port',
      messageText: 'retain this prompt',
    });
    await composition.dispose?.();
  });

  it('bootstraps the exact persisted Conversation as the active Tab at revision zero', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-1');
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        viewEpoch: 1,
        rendererEpoch: 1,
        connectionId: 'connection-1',
      },
      initialConversationId: 'conversation-1',
      initialConversationMessage: {
        id: 'message-initial-1',
        role: 'user',
        content: 'retain this prompt',
        timestamp: Date.parse('2026-07-28T00:00:00.000Z'),
      },
    });
    const posted: AgentHostToWebviewMessage[] = [];
    const context = {
      identity: {
        hostKind: 'electron' as const,
        applicationId: 'neko-desktop',
        windowId: 'window-1',
        viewId: 'view-1',
        workspaceId: workspace.workspaceId,
        rendererEpoch: '1',
        connectionId: 'connection-1',
      },
      post: async (message: AgentHostToWebviewMessage) => {
        posted.push(message);
      },
    };

    await effects.config.readTabState(context);
    await effects.conversation.readActiveConversation(context);

    expect(posted).toEqual([
      {
        type: 'tabState',
        tabState: {
          openTabs: [
            {
              id: 'tab-conversation-1',
              title: 'New conversation',
              conversationId: 'conversation-1',
            },
          ],
          activeTabId: 'tab-conversation-1',
        },
        revision: 0,
      },
      {
        type: 'activeConversation',
        conversation: {
          id: 'conversation-1',
          title: 'New conversation',
          messages: [
            {
              id: 'message-initial-1',
              role: 'user',
              content: 'retain this prompt',
              timestamp: Date.parse('2026-07-28T00:00:00.000Z'),
            },
          ],
        },
      },
    ]);

    effects.dispose();
    await composition.dispose?.();
  });

  it('rejects a bootstrap Conversation that is absent from the exact Workspace runtime', async () => {
    const workspace = createWorkspace();
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError: vi.fn(),
    });

    expect(() =>
      composition.createEffects({
        workspace,
        identity: {
          applicationInstanceId: 'app-1',
          windowId: 'window-1',
          projectId: 'project-1',
          workspaceId: workspace.workspaceId,
          viewId: 'view-1',
          viewEpoch: 1,
          rendererEpoch: 1,
          connectionId: 'connection-1',
        },
        initialConversationId: 'conversation-missing',
      }),
    ).toThrow(
      "Desktop Agent initial Conversation 'conversation-missing' does not exist in Workspace 'workspace-1'.",
    );
    await composition.dispose?.();
  });

  it('advertises the complete base effect composition and routes through workspace owners', async () => {
    const workspace = createWorkspace();
    const posted: AgentHostToWebviewMessage[] = [];
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        viewEpoch: 1,
        rendererEpoch: 1,
        connectionId: 'connection-1',
      },
    });
    const context = {
      identity: {
        hostKind: 'electron' as const,
        applicationId: 'neko-desktop',
        windowId: 'window-1',
        viewId: 'view-1',
        workspaceId: workspace.workspaceId,
        rendererEpoch: '1',
        connectionId: 'connection-1',
      },
      post: async (message: AgentHostToWebviewMessage) => {
        posted.push(message);
      },
    };

    expect(composition.requirements).toEqual({
      'conversation-effects': true,
      'config-effects': true,
      'skill-effects': true,
      'content-effects': true,
      'projection-effects': true,
    });
    expect(auditDesktopAgentStartup(composition)).toEqual({ ready: true });

    await effects.conversation.createConversation(context);
    expect(workspace.createConversation).toHaveBeenCalledOnce();
    expect(posted.map((message) => message.type)).toEqual([
      'conversationList',
      'tabState',
      'activeConversation',
    ]);
    const tabState = posted.find((message) => message.type === 'tabState');
    if (!tabState || tabState.type !== 'tabState' || !tabState.tabState) {
      throw new Error('Expected Agent tab state.');
    }
    const { activeTabId, openTabs } = tabState.tabState;
    if (!openTabs || activeTabId === undefined)
      throw new Error('Expected complete Agent tab state.');
    const activeTab = openTabs.find((tab) => tab.id === activeTabId);
    if (!activeTab) throw new Error('Expected an active Agent conversation Tab.');
    const cutContext = {
      type: 'cut-clip' as const,
      id: 'cut:clip-1',
      label: 'Clip 1',
      summary: 'Explicit Cut Clip',
      data: { documentId: 'project.otio', clipId: 'clip-1' },
    };
    await effects.injectContext(cutContext);
    expect(posted.at(-1)).toEqual({
      type: 'injectContext',
      tabId: activeTab.id,
      conversationId: activeTab.conversationId,
      payload: cutContext,
    });

    await effects.projection.discoverEndpoint(
      {
        type: 'projectionEndpointDiscover',
        protocolVersion: 1,
        realmId: 'realm-1',
      },
      context,
    );
    expect(posted.at(-1)).toEqual({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'connection-1',
    });

    effects.dispose();
    await composition.dispose?.();
  });

  it('removes credential material from renderer config projection', () => {
    const projected = projectAgentSecretSafeConfig({
      providers: [],
      configuredProviders: [
        {
          id: 'provider-1',
          name: 'Provider',
          type: 'openai',
          enabled: true,
          apiKey: 'must-not-cross-renderer',
          baseUrl: 'https://example.test',
          models: [],
        },
      ],
      selectedProviderId: 'provider-1',
      selectedModelId: 'model-1',
      customSystemPrompt: '',
      autoExecuteTools: false,
      streamResponses: true,
      showToolCalls: true,
      temperature: 0.7,
      maxTokens: 2048,
      executionMode: 'ask',
      chatModelOptions: [],
      modelGroups: [],
      defaultMediaModels: {},
    });

    expect(JSON.stringify(projected)).not.toContain('must-not-cross-renderer');
    expect(projected.configuredProviders[0]).not.toHaveProperty('apiKey');
  });

  it('releases attachment display leases when snapshot delivery fails fatally', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-controller-display-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'media'));
    await writeFile(join(root, 'media', 'clip.mp4'), 'fixture');
    const projection = createLocatorBackedProjection();
    const workspace = createWorkspace(root, projection);
    const release = vi.fn();
    const reportError = vi.fn();
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release,
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
        selectWorkspaceWriteTarget: vi.fn(),
      },
      configInteraction: {
        openUserConfig: vi.fn(),
        openWorkspaceConfig: vi.fn(),
      },
      reportError,
    });
    const identity = {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      projectId: 'project-1',
      workspaceId: workspace.workspaceId,
      viewId: 'view-1',
      viewEpoch: 1,
      rendererEpoch: 1,
      connectionId: 'connection-1',
    };
    const effects = composition.createEffects({ workspace, identity });
    const posted: AgentHostToWebviewMessage[] = [];
    const context = {
      identity: {
        hostKind: 'electron' as const,
        applicationId: 'neko-desktop',
        windowId: 'window-1',
        viewId: 'view-1',
        workspaceId: workspace.workspaceId,
        rendererEpoch: '1',
        connectionId: 'connection-1',
      },
      post: async (message: AgentHostToWebviewMessage) => {
        if (message.type === 'projectionSnapshot') {
          throw new Error('Webview projection delivery failed.');
        }
        posted.push(message);
      },
    };
    const key = {
      endpointEpoch: 'connection-1',
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: projection.conversationId,
    };

    await expect(
      effects.projection.attach({ type: 'projectionAttach', key }, context),
    ).rejects.toThrow('Webview projection delivery failed.');
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(reportError).toHaveBeenCalledOnce();
    expect(posted).toContainEqual(
      expect.objectContaining({
        type: 'sessionDiagnostic',
        code: 'projection-attachment-protocol-fatal',
        conversationId: projection.conversationId,
      }),
    );

    effects.dispose();
    await composition.dispose?.();
  });
});

function createWorkspace(
  workspacePath = '/workspace/demo',
  projection: ConversationProjectionSnapshot = {
    conversationId: 'conversation-1',
    projectionVersion: 0,
    turns: [],
  },
): AgentWorkspaceRuntime & {
  readonly createConversation: ReturnType<typeof vi.fn>;
  readonly ensureConversation: ReturnType<typeof vi.fn>;
  readonly checkpointFailedInitialTurn: ReturnType<typeof vi.fn>;
} {
  const records: Array<{
    workspaceId: string;
    conversationId: string;
    title: string;
    activeBranchId: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  const createConversation = vi.fn(async (conversationId: string) => {
    records.push({
      workspaceId: 'workspace-1',
      conversationId,
      title: 'New conversation',
      activeBranchId: 'main',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    });
  });
  return {
    workspaceId: 'workspace-1',
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: 'Demo',
      locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
    },
    models: createOpenNekoPiModels({
      read: async () => undefined,
      modify: async (_providerId, operation) => operation(undefined),
      delete: async () => undefined,
    }),
    tools: createToolRegistry(),
    createConversation,
    ensureConversation: vi.fn(async (conversationId: string) => {
      if (!records.some((record) => record.conversationId === conversationId)) {
        await createConversation(conversationId);
      }
    }),
    checkpointFailedInitialTurn: vi.fn(async () => undefined),
    deleteConversation: vi.fn(),
    clearAllConversations: vi.fn(),
    openConversation: vi.fn(),
    startTurn: vi.fn(),
    executeTurn: vi.fn(),
    cancelTurn: vi.fn(),
    readActiveTurn: vi.fn(),
    readConversationEntries: vi.fn(async () => []),
    readContextTokenCount: vi.fn(async () => 0),
    clearContext: vi.fn(),
    compactContext: vi.fn(),
    readSkillCatalog: vi.fn(async () => ({
      records: [],
      diagnostics: [],
      warnings: [],
    })),
    listConversations: () => records,
    readConversationEvidence: vi.fn(),
    readConversationProjection: vi.fn(() => projection),
    subscribeConversationProjection: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  };
}

function createLocatorBackedProjection(): ConversationProjectionSnapshot {
  const item: AgentTurnTimelineToolCallItem = {
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    runId: 'run-1',
    messageId: 'message-1',
    itemId: 'tool-item-1',
    sequence: 1,
    itemRevision: 1,
    status: 'complete',
    createdAt: 1,
    updatedAt: 1,
    kind: 'tool_call',
    parentAnchor: 'turn',
    payload: {
      toolCall: {
        id: 'tool-call-1',
        name: 'ReadDocument',
        arguments: {
          contentLocator: { kind: 'workspace-file', path: 'documents/source.pdf' },
        },
        result: {
          success: true,
          data: {
            contentLocator: { kind: 'workspace-file', path: 'media/clip.mp4' },
            mimeType: 'video/mp4',
          },
        },
      },
    },
  };
  return {
    conversationId: 'conversation-1',
    projectionVersion: 1,
    turns: [
      {
        turnId: 'turn-1',
        runId: 'run-1',
        messageId: 'message-1',
        items: [item],
      },
    ],
  };
}

function createHost() {
  return {
    files: {
      readText: vi.fn(),
      readBytes: vi.fn(),
      writeText: vi.fn(),
      writeBytes: vi.fn(),
      rename: vi.fn(),
      readDirectory: vi.fn(),
      stat: vi.fn(),
      createDirectory: vi.fn(),
      delete: vi.fn(),
    },
    paths: {
      resolvePath: vi.fn(),
      contractPath: vi.fn(),
      dirname: vi.fn(),
      basename: vi.fn(),
      join: vi.fn(),
      normalizePath: vi.fn(),
      isAbsolute: vi.fn(),
      isInside: vi.fn(),
    },
    accessPolicy: {
      decide: vi.fn(async () => ({ allowed: true as const })),
    },
    external: {
      openExternal: vi.fn(),
      revealPath: vi.fn(),
    },
  };
}

function createCredentialRuntime() {
  return createAgentCredentialRuntime({
    secrets: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    prompt: {
      text: async () => null,
      select: async () => null,
      notify: () => undefined,
    },
  });
}

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
  projectAgentConfigurationPolicy,
  projectAgentModelCatalog,
  projectAgentSecretSafeConfig,
  resolveAgentConversationTurnContext,
} from '@neko/agent-runtime/application';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';
import {
  ConfigManager,
  FileUserConfigManager,
  type AssistantRuntimeSettingsPort,
} from '@neko/host/settings';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Agent controller composition', () => {
  it('resolves Session file locators through the exact Conversation binding', async () => {
    const resolve = vi.fn(async () => [
      {
        type: 'file' as const,
        id: 'file:brief',
        label: 'brief.md',
        summary: 'Workspace file: brief.md',
        data: { text: 'brief contents' },
      },
    ]);
    const context = {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    };
    const references = [
      {
        id: 'file:brief',
        label: 'brief.md',
        contentLocator: { kind: 'workspace-file' as const, path: 'docs/brief.md' },
        mediaType: 'text' as const,
      },
    ];

    await expect(
      resolveAgentConversationTurnContext({
        resolver: { resolve },
        conversationId: 'conversation-1',
        context,
        contextPayloads: [
          {
            type: 'entity',
            id: 'entity-1',
            label: 'Entity 1',
            summary: 'Explicit entity context',
            data: {},
          },
        ],
        fileReferences: references,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'entity-1' }),
      expect.objectContaining({ id: 'file:brief', data: { text: 'brief contents' } }),
    ]);
    expect(resolve).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      context,
      references,
    });
  });

  it('checkpoints the initial message when provider preflight fails before a Pi turn starts', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-1');
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
      },
      reportError: vi.fn(),
    });

    await expect(
      composition.startInitialTurn?.({
        workspace,
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        messageText: 'retain this prompt',
        configuration: missingTurnConfiguration('conversation-1', 'turn-1'),
        context: {
          kind: 'workspace',
          workspaceId: workspace.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
        locale: 'en',
      }),
    ).rejects.toThrow("model 'provider-missing:model-missing' is stale or unavailable");
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
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
        configuration: missingTurnConfiguration('conversation-bound-port', 'turn-bound-port'),
        context: {
          kind: 'workspace',
          workspaceId: workspace.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
        locale: 'en',
      }),
    ).rejects.toThrow("model 'provider-missing:model-missing' is stale or unavailable");
    expect(workspace.checkpointFailedInitialTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-bound-port',
      turnId: 'turn-bound-port',
      messageText: 'retain this prompt',
    });
    await composition.dispose?.();
  });

  it('binds a configured image model into a text-only main model Turn policy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-image-purpose-'));
    temporaryRoots.push(root);
    const configPath = join(root, 'config.toml');
    await writeFile(
      configPath,
      [
        '[[providers]]',
        'id = "deepseek"',
        'name = "DeepSeek"',
        'type = "openai"',
        'api_url = "https://deepseek.example.test/v1"',
        'protocol_profile = "openai-chat"',
        'enabled = true',
        'requires_api_key = false',
        '',
        '[[providers]]',
        'id = "image-provider"',
        'name = "Image Provider"',
        'type = "openai"',
        'api_url = "https://image.example.test/v1"',
        'enabled = true',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "deepseek-chat"',
        'name = "deepseek-chat"',
        'provider_id = "deepseek"',
        'type = "llm"',
        'capabilities = ["chat", "tools"]',
        'context_window = 8192',
        'max_output_tokens = 4096',
        'enabled = true',
        '',
        '[[models]]',
        'id = "image-model"',
        'name = "image-model-api"',
        'provider_id = "image-provider"',
        'type = "image"',
        'capabilities = ["text_to_image"]',
        'enabled = true',
      ].join('\n'),
      'utf8',
    );
    const config = new ConfigManager({
      userConfigManager: new FileUserConfigManager({ filePath: configPath }),
      assistantRuntimeSettings: createRuntimeSettings({
        selectedProviderId: 'deepseek',
        selectedModelId: 'deepseek-chat',
      }),
    });
    const workspace = createWorkspace(root);
    await workspace.createConversation('conversation-image');
    const request = {
      modelCatalogEntryId: 'deepseek:deepseek-chat',
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      executionMode: 'ask' as const,
      temperature: 0.7,
      maximumOutputTokens: 4096,
      thinkingBudget: 0,
    };
    const configuration = {
      conversationId: 'conversation-image',
      turnId: 'turn-image',
      request,
      projection: projectAgentConfigurationPolicy({
        models: projectAgentModelCatalog(config.getAssistantConfigState()),
        request,
        source: 'draft-request' as const,
        defaults: {
          executionMode: 'ask' as const,
          temperature: 0.7,
          maximumOutputTokens: 4096,
          thinkingBudget: 0,
        },
      }),
    };
    const turnIdentity = {
      workspaceId: workspace.workspaceId,
      conversationId: 'conversation-image',
      branchId: 'main',
      turnId: 'turn-image',
      runId: 'run-image',
    };
    workspace.startTurn.mockImplementation((input) => ({
      identity: turnIdentity,
      completion: Promise.resolve({
        identity: turnIdentity,
        durability: 'durable',
        projection: { conversationId: 'conversation-image', turns: [] },
        configuration: input.configuration,
        path: {
          runtime: 'pi-conversation-runtime',
          transcript: 'pi-session',
          metadata: 'sqlite',
          projection: 'conversation-projection-store',
        },
      }),
    }));
    workspace.readConversationEvidence.mockReturnValue({
      workspaceId: workspace.workspaceId,
      conversationId: 'conversation-image',
      branchId: 'main',
      piSessionId: 'pi-session-image',
      writerLeaseId: 'writer-lease-image',
    });
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: root,
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: () => config,
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
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
    });

    await composition.startInitialTurn?.({
      workspace,
      conversationId: 'conversation-image',
      turnId: 'turn-image',
      messageText: 'Generate an image',
      configuration,
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
      locale: 'en',
      purposeModels: {
        'image.generate': {
          providerId: 'image-provider',
          modelId: 'image-model',
          category: 'image',
        },
      },
    });

    expect(workspace.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPolicy: expect.objectContaining({
          'agent.main': expect.objectContaining({ execution: 'pi' }),
          'image.generate': {
            purpose: 'image.generate',
            execution: 'domain',
            model: {
              provider: 'image-provider',
              id: 'image-model',
              name: 'image-model-api',
            },
            parameters: {},
          },
        }),
      }),
    );
    await composition.dispose?.();
  });

  it('bootstraps the exact persisted Conversation as the active Tab', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-1');
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
      },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
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

  it('projects blocked Workspace Board delivery to the owning Conversation and neutral facts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-board-diagnostic-'));
    temporaryRoots.push(root);
    const configPath = join(root, 'config.toml');
    await writeFile(
      configPath,
      [
        '[[providers]]',
        'id = "provider-1"',
        'name = "Provider"',
        'type = "openai"',
        'api_url = "https://example.test/v1"',
        'protocol_profile = "openai-chat"',
        'enabled = true',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "model-1"',
        'name = "model-1"',
        'provider_id = "provider-1"',
        'type = "llm"',
        'capabilities = ["chat", "tools"]',
        'context_window = 8192',
        'max_output_tokens = 4096',
        'enabled = true',
      ].join('\n'),
      'utf8',
    );
    const config = new ConfigManager({
      userConfigManager: new FileUserConfigManager({ filePath: configPath }),
      assistantRuntimeSettings: createRuntimeSettings({
        selectedProviderId: 'provider-1',
        selectedModelId: 'model-1',
      }),
    });
    const workspace = createWorkspace(root);
    await workspace.createConversation('conversation-board-blocked');
    const turnIdentity = {
      workspaceId: workspace.workspaceId,
      conversationId: 'conversation-board-blocked',
      branchId: 'main',
      turnId: 'turn-board-blocked',
      runId: 'run-board-blocked',
    };
    workspace.readConversationEvidence.mockReturnValue({
      workspaceId: workspace.workspaceId,
      conversationId: turnIdentity.conversationId,
      branchId: turnIdentity.branchId,
      piSessionId: 'pi-session-board-blocked',
      writerLeaseId: 'writer-lease-board-blocked',
    });
    workspace.startTurn.mockImplementation(
      (input: Parameters<AgentWorkspaceRuntime['startTurn']>[0]) => ({
        identity: turnIdentity,
        completion: Promise.resolve({
          identity: turnIdentity,
          durability: 'durable',
          projection: {
            conversationId: turnIdentity.conversationId,
            turns: [
              {
                turnId: turnIdentity.turnId,
                runId: turnIdentity.runId,
                messageId: 'message-board-blocked',
                items: [],
                completion: { status: 'completed', completedAt: 1 },
              },
            ],
          },
          configuration: input.configuration,
          artifactDelivery: {
            status: 'blocked',
            diagnostic: {
              code: 'workspace-board-read-only',
              message: 'Host-only detail.',
            },
          },
          path: {
            runtime: 'pi-conversation-runtime',
            transcript: 'pi-session',
            metadata: 'sqlite',
            projection: 'conversation-projection-store',
          },
        }),
      }),
    );
    const request = {
      modelCatalogEntryId: 'provider-1:model-1',
      providerId: 'provider-1',
      modelId: 'model-1',
      executionMode: 'ask' as const,
      temperature: 0.7,
      maximumOutputTokens: 4096,
      thinkingBudget: 0,
    };
    const configuration = {
      conversationId: turnIdentity.conversationId,
      request,
      projection: projectAgentConfigurationPolicy({
        models: projectAgentModelCatalog(config.getAssistantConfigState()),
        request,
        source: 'conversation',
        defaults: {
          executionMode: 'ask',
          temperature: 0.7,
          maximumOutputTokens: 4096,
          thinkingBudget: 0,
        },
      }),
    };
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: root,
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: () => config,
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
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        connectionId: 'connection-1',
      },
      readConversationConfiguration: async () => configuration,
      readConversationContext: async () => ({
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      }),
    });
    const posted: AgentHostToWebviewMessage[] = [];
    effects.conversation.submitTurn(
      {
        source: 'user-message',
        conversationId: turnIdentity.conversationId,
        messageText: 'Create a durable artifact.',
        sessionMode: 'agent',
        locale: 'en',
      },
      {
        identity: {
          hostKind: 'electron',
          applicationId: 'neko-desktop',
          windowId: 'window-1',
          viewId: 'view-1',
          workspaceId: workspace.workspaceId,
          connectionId: 'connection-1',
        },
        post: (message) => {
          posted.push(message);
        },
      },
    );

    await vi.waitFor(() =>
      expect(posted).toContainEqual({
        type: 'sessionDiagnostic',
        code: 'canvas-board-delivery-failed',
        severity: 'error',
        message:
          'Workspace Board delivery was blocked (workspace-board-read-only). The artifact remains available.',
        action: 'workspace-board-delivery',
        conversationId: turnIdentity.conversationId,
      }),
    );
    const facts = effects.automation?.readFacts(turnIdentity);
    expect(facts).toMatchObject({
      projection: { terminalState: 'completed' },
    });
    expect(facts?.diagnostics.items).toContainEqual(
      expect.objectContaining({
        code: 'workspace-board-read-only',
        severity: 'error',
      }),
    );

    effects.dispose();
    await composition.dispose?.();
  });

  it('rejects a bootstrap Conversation that is absent from the exact Workspace runtime', async () => {
    const workspace = createWorkspace();
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
      },
      reportError: vi.fn(),
    });

    expect(() =>
      composition.createEffects({
        workspace,
        identity: {
          applicationInstanceId: 'app-1',
          windowId: 'window-1',
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'agent-surface-1',
          projectId: 'project-1',
          workspaceId: workspace.workspaceId,
          viewId: 'view-1',
          connectionId: 'connection-1',
        },
        initialConversationId: 'conversation-missing',
      }),
    ).toThrow(
      "Desktop Agent initial Conversation 'conversation-missing' does not exist in Workspace 'workspace-1'.",
    );
    await composition.dispose?.();
  });

  it('serializes Tab mutations per connection and continues after a rejected mutation', async () => {
    const workspace = createWorkspace();
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
      },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        connectionId: 'connection-1',
      },
    });
    const identity = {
      hostKind: 'electron' as const,
      applicationId: 'neko-desktop',
      windowId: 'window-1',
      viewId: 'view-1',
      workspaceId: workspace.workspaceId,
      connectionId: 'connection-1',
    };
    const events: string[] = [];
    let releaseFirstPost: (() => void) | undefined;
    const firstPostGate = new Promise<void>((resolve) => {
      releaseFirstPost = resolve;
    });
    const first = effects.config.updateTabState(
      {
        type: 'updateTabState',
        openTabs: [{ id: 'tab-a', title: 'A', conversationId: 'conversation-a' }],
        activeTabId: null,
      },
      {
        identity,
        post: async () => {
          events.push('first-start');
          await firstPostGate;
          events.push('first-complete');
        },
      },
    );
    const second = effects.config.updateTabState(
      {
        type: 'updateTabState',
        openTabs: [{ id: 'tab-b', title: 'B', conversationId: 'conversation-b' }],
        activeTabId: null,
      },
      {
        identity,
        post: async () => {
          events.push('second');
        },
      },
    );

    await vi.waitFor(() => expect(events).toEqual(['first-start']));
    releaseFirstPost?.();
    await Promise.all([first, second]);
    expect(events).toEqual(['first-start', 'first-complete', 'second']);

    const rejected = effects.config.updateTabState(
      {
        type: 'updateTabState',
        openTabs: [{ id: 'tab-failed', title: 'Failed', conversationId: 'conversation-failed' }],
        activeTabId: null,
      },
      {
        identity,
        post: async () => {
          throw new Error('Tab projection delivery failed.');
        },
      },
    );
    const recovered = effects.config.updateTabState(
      {
        type: 'updateTabState',
        openTabs: [{ id: 'tab-final', title: 'Final', conversationId: 'conversation-final' }],
        activeTabId: null,
      },
      { identity, post: vi.fn(async () => undefined) },
    );

    await expect(rejected).rejects.toThrow('Tab projection delivery failed.');
    await expect(recovered).resolves.toBeUndefined();
    const finalMessages: AgentHostToWebviewMessage[] = [];
    await effects.config.readTabState({
      identity,
      post: async (message) => {
        finalMessages.push(message);
      },
    });
    expect(finalMessages).toEqual([
      {
        type: 'tabState',
        tabState: {
          openTabs: [{ id: 'tab-final', title: 'Final', conversationId: 'conversation-final' }],
          activeTabId: null,
        },
      },
    ]);

    effects.dispose();
    await composition.dispose?.();
  });

  it('advertises the complete base effect composition and routes through workspace owners', async () => {
    const workspace = createWorkspace();
    const posted: AgentHostToWebviewMessage[] = [];
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
      },
      reportError: vi.fn(),
    });
    const effects = composition.createEffects({
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
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

    await workspace.createConversation('conversation-owner-1');
    const activeTab = {
      id: 'tab-conversation-owner-1',
      title: 'Owner conversation',
      conversationId: 'conversation-owner-1',
    };
    await effects.conversation.listConversations(context);
    await effects.conversation.activateConversation(
      {
        type: 'activateConversation',
        activationId: 1,
        conversationId: activeTab.conversationId,
        tabId: activeTab.id,
        tabState: { openTabs: [activeTab], activeTabId: activeTab.id },
      },
      context,
    );
    expect(workspace.createConversation).toHaveBeenCalledOnce();
    expect(posted.map((message) => message.type)).toEqual([
      'conversationList',
      'tabState',
      'activeConversation',
    ]);
    await effects.conversation.readMessageQueue(activeTab.conversationId, context);
    await effects.conversation.promoteQueuedMessage(
      { conversationId: activeTab.conversationId, queueItemId: 'queued-turn-1' },
      context,
    );
    await effects.conversation.cancelQueuedMessage(
      { conversationId: activeTab.conversationId, queueItemId: 'queued-turn-1' },
      context,
    );
    expect(workspace.readMessageQueue).toHaveBeenCalledWith(activeTab.conversationId);
    expect(workspace.promoteQueuedMessage).toHaveBeenCalledWith(
      activeTab.conversationId,
      'queued-turn-1',
    );
    expect(workspace.cancelQueuedMessage).toHaveBeenCalledWith(
      activeTab.conversationId,
      'queued-turn-1',
    );
    expect(posted.slice(-3).map((message) => message.type)).toEqual([
      'messageQueueSnapshot',
      'messageQueueSnapshot',
      'messageQueueSnapshot',
    ]);
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
        realmId: 'realm-1',
      },
      context,
    );
    expect(posted.at(-1)).toEqual({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });

    effects.dispose();
    await composition.dispose?.();
    expect(workspace.cancelTurn).not.toHaveBeenCalled();
    expect(workspace.dispose).not.toHaveBeenCalled();
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
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
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
      },
      reportError,
    });
    const identity = {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      projectId: 'project-1',
      workspaceId: workspace.workspaceId,
      viewId: 'view-1',
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
    turns: [],
  },
): AgentWorkspaceRuntime & {
  readonly createConversation: ReturnType<typeof vi.fn>;
  readonly ensureConversation: ReturnType<typeof vi.fn>;
  readonly checkpointFailedInitialTurn: ReturnType<typeof vi.fn>;
  readonly startTurn: ReturnType<typeof vi.fn<AgentWorkspaceRuntime['startTurn']>>;
  readonly readConversationEvidence: ReturnType<
    typeof vi.fn<AgentWorkspaceRuntime['readConversationEvidence']>
  >;
} {
  const records: Array<{
    workspaceId: string;
    conversationId: string;
    title: string;
    activeBranchId: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  const createConversation = vi.fn(async (conversationId: string, title = 'New conversation') => {
    records.push({
      workspaceId: 'workspace-1',
      conversationId,
      title,
      activeBranchId: 'main',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    });
  });
  const bindVisiblePresentation: AgentWorkspaceRuntime['bindVisiblePresentation'] = ({
    bindingId,
    conversationId: initialConversationId,
  }) => {
    let conversationId = initialConversationId;
    let disposed = false;
    return {
      bindingId,
      workspaceId: 'workspace-1',
      get conversationId() {
        return conversationId;
      },
      updateConversation: async (nextConversationId?: string) => {
        if (disposed) throw new Error(`Agent visible binding '${bindingId}' is disposed.`);
        conversationId = nextConversationId;
      },
      dispose: async () => {
        disposed = true;
      },
    };
  };
  const startTurn = vi.fn<AgentWorkspaceRuntime['startTurn']>();
  const readConversationEvidence = vi.fn<AgentWorkspaceRuntime['readConversationEvidence']>();
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
    ensureConversation: vi.fn(async (conversationId: string, title: string) => {
      if (!records.some((record) => record.conversationId === conversationId)) {
        await createConversation(conversationId, title);
      }
    }),
    checkpointFailedInitialTurn: vi.fn(async () => undefined),
    deleteConversation: vi.fn(),
    clearAllConversations: vi.fn(),
    openConversation: vi.fn(),
    startTurn,
    executeTurn: vi.fn(),
    readMessageQueue: vi.fn((conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      sequence: 0,
    })),
    promoteQueuedMessage: vi.fn((conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      sequence: 0,
    })),
    cancelQueuedMessage: vi.fn(async (conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      sequence: 0,
    })),
    takeQueuedMessageForEdit: vi.fn(),
    clearMessageQueue: vi.fn(async (conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      sequence: 0,
    })),
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
    readCapabilityPromptFragments: () => [],
    listConversations: () => records,
    readConversationEvidence,
    readConversationProjection: vi.fn(() => projection),
    subscribeConversationProjection: vi.fn(() => () => undefined),
    bindVisiblePresentation,
    protectConversationRuntime: vi.fn(),
    readRuntimeResidency: vi.fn(() => ({
      workspaceId: 'workspace-1',
      visibleBindingCount: 1,
      releaseRequested: false,
      releasable: false,
      conversations: [],
    })),
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
    configCredentials: { read: async () => undefined },
    prompt: {
      text: async () => null,
      select: async () => null,
      notify: () => undefined,
    },
  });
}

function createRuntimeSettings(
  initial: ReturnType<AssistantRuntimeSettingsPort['snapshot']> = {},
): AssistantRuntimeSettingsPort {
  let settings: ReturnType<AssistantRuntimeSettingsPort['snapshot']> = { ...initial };
  return {
    snapshot: () => settings,
    commit: async (next) => {
      settings = { ...next };
    },
    reset: async () => {
      settings = {};
    },
    diagnostic: () => undefined,
  };
}

function createWorkspaceConfigResolver(): () => ConfigManager {
  const config = new ConfigManager({
    userConfigManager: new FileUserConfigManager({
      filePath: '/fixture/nonexistent/config.toml',
    }),
    assistantRuntimeSettings: createRuntimeSettings(),
  });
  return () => config;
}

function missingTurnConfiguration(conversationId: string, turnId: string) {
  const request = {
    modelCatalogEntryId: 'provider-missing:model-missing',
    providerId: 'provider-missing',
    modelId: 'model-missing',
    executionMode: 'ask' as const,
    temperature: 0.7,
    maximumOutputTokens: 4096,
    thinkingBudget: 0,
  };
  return {
    conversationId,
    turnId,
    request,
    projection: projectAgentConfigurationPolicy({
      models: [],
      request,
      source: 'draft-request',
      defaults: {
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 0,
      },
    }),
  };
}

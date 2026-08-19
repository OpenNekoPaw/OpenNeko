import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenNekoPiModels, type PiConversationTranscriptEntry } from '@neko/agent-runtime/pi';
import { createToolRegistry } from '@neko/agent-runtime/tool-registry';
import type {
  AgentHostToWebviewMessage,
  AgentEntryTargetReceipt,
  AgentTurnTimelineToolCallItem,
  ConversationProjectionSnapshot,
} from '@neko/agent-contracts';
import { CONFIGURED_AGENT_TURN_CAPABILITIES } from '@neko/agent-contracts';
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
import { createCanvasWorkspaceIndexService } from '@neko/canvas-domain';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';
import {
  ConfigManager,
  FileUserConfigManager,
  FileProviderCredentialSource,
  type AssistantRuntimeSettingsPort,
} from '@neko/host/settings';

const temporaryRoots: string[] = [];
const readConfiguredCapabilityConstraint = async () => CONFIGURED_AGENT_TURN_CAPABILITIES;

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Agent controller composition', () => {
  it('creates initial Conversation configuration from the exact Composer model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-initial-model-'));
    temporaryRoots.push(root);
    const config = await createConfiguredWorkspaceConfig(root, {});
    const workspace = createWorkspace(root);
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: () => config,
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });

    await expect(
      composition.createInitialConversationConfiguration({
        workspace,
        model: { providerId: 'provider-1', modelId: 'model-1', category: 'llm' },
      }),
    ).resolves.toMatchObject({
      request: {
        modelCatalogEntryId: 'provider-1:model-1',
        providerId: 'provider-1',
        modelId: 'model-1',
      },
      projection: {
        request: {
          providerId: 'provider-1',
          modelId: 'model-1',
        },
      },
    });

    await composition.dispose?.();
  });

  it('projects the exact owner-bound Composer catalog without a Conversation lookup', async () => {
    const workspace = createWorkspace();
    const readConversationContext = vi.fn();
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
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      composer: {
        phase: 'composer',
        composerId: 'composer-workspace-1',
        binding: {
          kind: 'workspace',
          workspaceId: workspace.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
      },
      readConversationContext,
      personalSkillOwnerId: 'assistant-space-1',
    });
    const posted: AgentHostToWebviewMessage[] = [];

    await effects.skill.readComposerInputCatalog({
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
    });

    expect(readConversationContext).not.toHaveBeenCalled();
    expect(workspace.readSkillCatalog).toHaveBeenCalledWith(true);
    expect(posted).toEqual([
      expect.objectContaining({
        type: 'agentComposerInputCatalog',
        composerId: 'composer-workspace-1',
        phase: 'composer',
        bindingKind: 'workspace',
      }),
    ]);
  });

  it('projects no Skill activation entries for a persisted Narrative capability constraint', async () => {
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
      },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      readConversationContext: async () => ({
        kind: 'character',
        characterId: 'character-1',
        characterVersionId: 'character-version-1',
        characterRunId: 'character-run-1',
        dialogueRunId: 'dialogue-run-1',
      }),
      readConversationCapabilityConstraint: async () => ({
        owner: { kind: 'character', id: 'character-run-1' },
        skills: 'none',
        tools: 'none',
        references: 'none',
      }),
      personalSkillOwnerId: 'assistant-space-1',
      readGlobalSkillCatalog: async () => ({
        records: [],
        diagnostics: [],
        warnings: [],
        commands: { records: [], diagnostics: [] },
      }),
    });
    const posted: AgentHostToWebviewMessage[] = [];

    await effects.skill.readInputCatalog('conversation-narrative', {
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
    });

    expect(workspace.readSkillCatalog).not.toHaveBeenCalled();
    expect(posted).toEqual([
      expect.objectContaining({
        type: 'agentInputCatalog',
        entries: expect.not.arrayContaining([expect.objectContaining({ trigger: 'skill' })]),
      }),
    ]);
  });

  it('rejects Narrative references before domain or reference materialization on later turns', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-narrative');
    const resolveReferences = vi.fn(async () => []);
    const resolveDomain = vi.fn(async () => ({ contextPayloads: [] }));
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
      conversationReferences: { resolve: resolveReferences },
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
      },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const configuration = missingTurnConfiguration('conversation-narrative', 'turn-narrative');
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
        kind: 'character',
        characterId: 'character-1',
        characterVersionId: 'character-version-1',
        characterRunId: 'character-run-1',
        dialogueRunId: 'dialogue-run-1',
      }),
      readConversationEntryTargetReceipt: async () => null,
      readConversationCapabilityConstraint: async () => ({
        owner: { kind: 'character', id: 'character-run-1' },
        skills: 'none',
        tools: 'none',
        references: 'none',
      }),
      resolveConversationDomainTurnContext: { resolve: resolveDomain },
    });
    const posted: AgentHostToWebviewMessage[] = [];

    await expect(
      effects.conversation.submitTurn(
        {
          source: 'user-message',
          conversationId: 'conversation-narrative',
          messageText: 'Use this forbidden source.',
          sessionMode: 'agent',
          locale: 'en',
          fileReferences: [
            {
              id: 'file:forbidden',
              label: 'forbidden.md',
              contentLocator: { file: { authority: 'workspace', path: 'forbidden.md' } },
              mediaType: 'text',
            },
          ],
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
      ),
    ).rejects.toThrow('forbids external references');

    await vi.waitFor(() =>
      expect(posted).toContainEqual(
        expect.objectContaining({
          type: 'error',
          conversationId: 'conversation-narrative',
          message: expect.stringContaining('forbids external references'),
        }),
      ),
    );
    expect(resolveDomain).not.toHaveBeenCalled();
    expect(resolveReferences).not.toHaveBeenCalled();
    expect(workspace.startTurn).not.toHaveBeenCalled();

    effects.dispose();
    await composition.dispose?.();
  });

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
        contentLocator: { file: { authority: 'workspace' as const, path: 'docs/brief.md' } },
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
        capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
        capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
      }),
    ).rejects.toThrow("model 'provider-missing:model-missing' is stale or unavailable");
    expect(workspace.checkpointFailedInitialTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-bound-port',
      turnId: 'turn-bound-port',
      messageText: 'retain this prompt',
    });
    await composition.dispose?.();
  });

  it('binds media purposes through config and login credentials without blocking ordinary chat', async () => {
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
        'requires_api_key = true',
        'api_key = "config-image-secret"',
        '',
        '[[providers]]',
        'id = "login-image-provider"',
        'name = "Login Image Provider"',
        'type = "openai"',
        'api_url = "https://login-image.example.test/v1"',
        'enabled = true',
        'requires_api_key = true',
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
        '',
        '[[models]]',
        'id = "login-image-model"',
        'name = "login-image-model-api"',
        'provider_id = "login-image-provider"',
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
        customSystemPrompt: 'Use the configured creator terminology.',
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
    workspace.startTurn.mockImplementation((input) => {
      const turnId = input.turnId;
      if (!turnId) throw new Error('Fixture Turn requires an exact identity.');
      const turnIdentity = {
        workspaceId: workspace.workspaceId,
        conversationId: 'conversation-image',
        branchId: 'main',
        turnId,
        runId: `run-${turnId}`,
      };
      input.onSystemPromptComposed?.({
        identity: turnIdentity,
        systemPrompt: `Final prompt for ${turnId}`,
      });
      return {
        identity: turnIdentity,
        queueItem: {
          id: `queue-${turnId}`,
          conversationId: input.conversationId,
          content: input.presentationText ?? input.prompt,
          createdAt: 1,
          source: 'composer' as const,
        },
        state: 'active' as const,
        completion: Promise.resolve({
          identity: turnIdentity,
          durability: 'durable',
          projection: {
            conversationId: 'conversation-image',
            turns: [
              {
                turnId: turnIdentity.turnId,
                runId: turnIdentity.runId,
                messageId: 'message-image',
                items: [
                  {
                    conversationId: 'conversation-image',
                    turnId: turnIdentity.turnId,
                    runId: turnIdentity.runId,
                    messageId: 'message-image',
                    itemId: 'assistant-image',
                    sequence: 1,
                    kind: 'assistant_text',
                    status: 'complete',
                    createdAt: 1,
                    updatedAt: 1,
                    payload: { content: 'Image request completed.' },
                  },
                ],
                completion: { status: 'completed', completedAt: 1 },
              },
            ],
          },
          configuration: input.configuration,
          path: {
            runtime: 'pi-conversation-runtime',
            transcript: 'pi-session',
            metadata: 'sqlite',
            projection: 'conversation-projection-store',
          },
        }),
      };
    });
    workspace.readConversationEvidence.mockReturnValue({
      workspaceId: workspace.workspaceId,
      conversationId: 'conversation-image',
      branchId: 'main',
      piSessionId: 'pi-session-image',
      writerLeaseId: 'writer-lease-image',
    });
    const storedSecrets = new Map<string, string>();
    const secretGet = vi.fn(async (key: string) => storedSecrets.get(key));
    const credentialRuntime = createAgentCredentialRuntime({
      secrets: {
        get: secretGet,
        set: async (key, value) => {
          storedSecrets.set(key, value);
        },
        delete: async (key) => {
          storedSecrets.delete(key);
        },
      },
      configCredentials: new FileProviderCredentialSource({ filePath: configPath }),
      prompt: {
        text: async () => null,
        select: async () => null,
        notify: () => undefined,
      },
    });
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: root,
      credentialRuntime,
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
      },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      entryTargetReceipt: authoringReceipt(),
      locale: 'en',
      capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
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
        entryTargetReceipt: authoringReceipt(),
        userInstructions: 'Use the configured creator terminology.',
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
    expect(config.getProvider('image-provider')).not.toHaveProperty('apiKey');
    expect(secretGet).not.toHaveBeenCalledWith('openneko.agent.pi.credential:image-provider');

    workspace.startTurn.mockClear();
    await composition.startInitialTurn?.({
      workspace,
      conversationId: 'conversation-image',
      turnId: 'turn-missing-image',
      messageText: 'Hello',
      configuration: { ...configuration, turnId: 'turn-missing-image' },
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
      locale: 'en',
      capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
      purposeModels: {
        'image.generate': {
          providerId: 'login-image-provider',
          modelId: 'login-image-model',
          category: 'image',
        },
      },
    });
    const missingCredentialPolicy = workspace.startTurn.mock.calls[0]?.[0].modelPolicy;
    expect(missingCredentialPolicy?.['agent.main']).toMatchObject({ execution: 'pi' });
    expect(missingCredentialPolicy?.['image.generate']).toBeUndefined();

    await credentialRuntime.credentials.replace('login-image-provider', {
      type: 'oauth',
      access: 'oauth-access',
      refresh: 'oauth-refresh',
      expires: Date.now() + 60_000,
    });
    workspace.startTurn.mockClear();
    await composition.startInitialTurn?.({
      workspace,
      conversationId: 'conversation-image',
      turnId: 'turn-oauth-image',
      messageText: 'Hello again',
      configuration: { ...configuration, turnId: 'turn-oauth-image' },
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
      locale: 'en',
      capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
      purposeModels: {
        'image.generate': {
          providerId: 'login-image-provider',
          modelId: 'login-image-model',
          category: 'image',
        },
      },
    });
    expect(workspace.startTurn.mock.calls[0]?.[0].modelPolicy['image.generate']).toBeUndefined();

    await credentialRuntime.credentials.replace('login-image-provider', {
      type: 'api_key',
      key: 'login-image-secret',
    });
    workspace.startTurn.mockClear();
    await composition.startInitialTurn?.({
      workspace,
      conversationId: 'conversation-image',
      turnId: 'turn-login-image',
      messageText: 'Generate an image',
      configuration: { ...configuration, turnId: 'turn-login-image' },
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
      locale: 'en',
      capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
      purposeModels: {
        'image.generate': {
          providerId: 'login-image-provider',
          modelId: 'login-image-model',
          category: 'image',
        },
      },
    });
    expect(workspace.startTurn.mock.calls[0]?.[0].modelPolicy['image.generate']).toMatchObject({
      execution: 'domain',
      model: { provider: 'login-image-provider', id: 'login-image-model' },
    });
    expect(JSON.stringify(workspace.startTurn.mock.calls[0]?.[0])).not.toContain(
      'login-image-secret',
    );
    await composition.dispose?.();
  });

  it.each([
    {
      label: 'ordinary message',
      input: { kind: 'message' as const, text: 'hello' },
    },
    {
      label: '$ Skill',
      input: {
        kind: 'skill' as const,
        catalogEntryId: 'skill:project:skill-fingerprint',
        skillName: 'review',
        activationId: 'skill:project:skill-fingerprint',
        args: 'check this',
      },
    },
    {
      label: '/ Command',
      input: {
        kind: 'command' as const,
        catalogEntryId: 'command:project:command-fingerprint',
        commandId: 'review-command',
        handlerId: 'command:project:command-fingerprint',
        args: 'check this',
      },
    },
  ])(
    'commits $label before publishing its Session and reading Session state',
    async ({ input }) => {
      const workspace = createWorkspace();
      vi.mocked(workspace.readSkillCatalog).mockResolvedValue({
        records: [
          {
            name: 'review',
            description: 'Review the exact Workspace',
            source: { kind: 'project' },
            fingerprint: 'skill-fingerprint',
            locator: {
              kind: 'skill',
              value: 'skills/review/SKILL.md',
              fingerprint: 'skill-fingerprint',
            },
          },
        ],
        diagnostics: [],
        warnings: [],
        commands: {
          records: [
            {
              name: 'review-command',
              description: 'Review with a command',
              source: { kind: 'project' },
              fingerprint: 'command-fingerprint',
              activationId: 'command:project:command-fingerprint',
              supportsArguments: true,
            },
          ],
          diagnostics: [],
        },
      });
      const events: string[] = [];
      const reserveConversationCreation = vi.fn(async () => {
        events.push('reserve');
      });
      const prepareInitialConversationTurn = vi.fn(async () => {
        events.push('firstSubmit');
        return { turnId: 'turn-first' };
      });
      const publishConversationCreation = vi.fn(async () => {
        events.push('publish');
      });
      vi.mocked(workspace.invokeCommand).mockImplementation(async () => {
        events.push('invokeCommand');
        return 'Resolved command prompt';
      });
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
        contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
        configInteraction: { openUserConfig: vi.fn() },
        reportError: vi.fn(),
        canvas: createCanvasIndexService(),
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
        composer: {
          phase: 'composer',
          composerId: 'composer-workspace-1',
          binding: {
            kind: 'workspace',
            workspaceId: workspace.workspaceId,
            workspaceGrantId: 'workspace-grant-1',
          },
        },
        personalSkillOwnerId: 'assistant-space-1',
        reserveConversationCreation,
        rollbackConversationCreation: vi.fn(async () => undefined),
        prepareInitialConversationTurn,
        publishConversationCreation,
        readConversationConfiguration: async () => {
          events.push('readConfiguration');
          throw new Error('stop after Session publication');
        },
        readConversationContext: async () => {
          events.push('readContext');
          return {
            kind: 'workspace',
            workspaceId: workspace.workspaceId,
            workspaceGrantId: 'workspace-grant-1',
          };
        },
        readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
        settleInitialConversationTurn: vi.fn(async () => undefined),
      });
      const post = vi.fn((message: AgentHostToWebviewMessage) => {
        events.push(message.type);
      });

      await expect(
        effects.conversation.createConversation(
          {
            type: 'createConversation',
            input,
            sessionMode: 'agent',
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
            post,
          },
        ),
      ).rejects.toThrow('stop after Session publication');

      expect(events.slice(0, 6)).toEqual([
        'reserve',
        'firstSubmit',
        'publish',
        'conversationList',
        'tabState',
        'activeConversation',
      ]);
      expect(events.indexOf('readConfiguration')).toBeGreaterThan(events.indexOf('publish'));
      if (input.kind === 'command') {
        expect(workspace.invokeCommand).toHaveBeenCalledOnce();
        expect(events.indexOf('invokeCommand')).toBeGreaterThan(events.indexOf('publish'));
      } else {
        expect(workspace.invokeCommand).not.toHaveBeenCalled();
      }
      expect(prepareInitialConversationTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          messageText: input.kind === 'message' ? input.text : input.args,
        }),
        input,
      );

      effects.dispose();
      await composition.dispose?.();
    },
  );

  it('rolls back a reserved runtime Conversation when first-submit persistence fails', async () => {
    const workspace = createWorkspace();
    const rollbackConversationCreation = vi.fn(async () => undefined);
    const publishConversationCreation = vi.fn(async () => undefined);
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
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      composer: {
        phase: 'composer',
        composerId: 'composer-workspace-1',
        binding: {
          kind: 'workspace',
          workspaceId: workspace.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
      },
      personalSkillOwnerId: 'assistant-space-1',
      reserveConversationCreation: vi.fn(async () => undefined),
      rollbackConversationCreation,
      publishConversationCreation,
      prepareInitialConversationTurn: async () => {
        throw new Error('first submit failed');
      },
    });
    const post = vi.fn();

    await expect(
      effects.conversation.createConversation(
        {
          type: 'createConversation',
          input: { kind: 'message', text: 'hello' },
          sessionMode: 'agent',
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
          post,
        },
      ),
    ).rejects.toThrow('first submit failed');
    const conversationId = vi.mocked(workspace.createConversation).mock.calls[0]?.[0];
    expect(rollbackConversationCreation).toHaveBeenCalledWith({ conversationId });
    expect(workspace.deleteConversation).toHaveBeenCalledWith(conversationId);
    expect(publishConversationCreation).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();

    effects.dispose();
    await composition.dispose?.();
  });

  it('rolls back when first-submit persistence returns no authoritative Turn', async () => {
    const workspace = createWorkspace();
    const rollbackConversationCreation = vi.fn(async () => undefined);
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
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      composer: {
        phase: 'composer',
        composerId: 'composer-workspace-1',
        binding: {
          kind: 'workspace',
          workspaceId: workspace.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
      },
      personalSkillOwnerId: 'assistant-space-1',
      reserveConversationCreation: vi.fn(async () => undefined),
      rollbackConversationCreation,
      publishConversationCreation: vi.fn(async () => undefined),
      prepareInitialConversationTurn: async () => undefined,
    });

    await expect(
      effects.conversation.createConversation(
        {
          type: 'createConversation',
          input: { kind: 'message', text: 'hello' },
          sessionMode: 'agent',
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
          post: vi.fn(),
        },
      ),
    ).rejects.toThrow('did not commit an initial lifecycle Turn');
    expect(rollbackConversationCreation).toHaveBeenCalledOnce();
    expect(workspace.deleteConversation).toHaveBeenCalledOnce();

    effects.dispose();
    await composition.dispose?.();
  });

  it('requires an existing lifecycle record for ordinary Session messages', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-missing-lifecycle');
    const prepareInitialConversationTurn = vi.fn(async () => ({ turnId: 'turn-unexpected' }));
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
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      prepareInitialConversationTurn,
      readConversationConfiguration: async () => {
        throw new Error("Agent Conversation 'conversation-missing-lifecycle' is not present.");
      },
    });

    await expect(
      effects.conversation.submitTurn(
        {
          source: 'user-message',
          conversationId: 'conversation-missing-lifecycle',
          messageText: 'must not create lifecycle state',
          sessionMode: 'agent',
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
          post: vi.fn(),
        },
      ),
    ).rejects.toThrow("Agent Conversation 'conversation-missing-lifecycle' is not present.");
    expect(prepareInitialConversationTurn).not.toHaveBeenCalled();

    effects.dispose();
    await composition.dispose?.();
  });

  it('deletes a newly created runtime Conversation when owner reservation fails', async () => {
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
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
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
      composer: {
        phase: 'composer',
        composerId: 'composer-workspace-1',
        binding: {
          kind: 'workspace',
          workspaceId: workspace.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
      },
      personalSkillOwnerId: 'assistant-space-1',
      reserveConversationCreation: async () => {
        throw new Error('owner reservation failed');
      },
    });
    const post = vi.fn();

    await expect(
      effects.conversation.createConversation(
        {
          type: 'createConversation',
          input: { kind: 'message', text: 'hello' },
          sessionMode: 'agent',
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
          post,
        },
      ),
    ).rejects.toThrow('owner reservation failed');
    expect(workspace.deleteConversation).toHaveBeenCalledWith(
      vi.mocked(workspace.createConversation).mock.calls[0]?.[0],
    );
    expect(post).not.toHaveBeenCalled();

    effects.dispose();
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const effects = composition.createEffects({
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
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

  it('reauthorizes restored ReadImage previews for active and snapshot routes', async () => {
    const workspace = createWorkspace();
    await workspace.createConversation('conversation-image-history');
    const locator = {
      file: { authority: 'workspace' as const, path: 'books/story.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/images/cover.png' },
    };
    const bytes = new Uint8Array([137, 80, 78, 71]);
    vi.mocked(workspace.readConversationEntries).mockResolvedValue(
      restoredReadImageEntries(locator),
    );
    vi.mocked(workspace.loadDisplayAsset!).mockResolvedValue({
      status: 'ready',
      bytes,
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
      diagnostics: [],
    });
    const registerBytes = vi.fn(async () => ({
      url: 'openneko://resource/ffffffffffffffffffffffffffffffff/content',
      release: vi.fn(),
    }));
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: createWorkspaceConfigResolver(),
      resources: {
        registerFile: vi.fn(async () => {
          throw new Error('Restored document entries must register loaded bytes.');
        }),
        registerBytes,
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
      },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const effects = composition.createEffects({
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        connectionId: 'connection-image-history',
      },
      initialConversationId: 'conversation-image-history',
    });
    const posted: AgentHostToWebviewMessage[] = [];
    const context = {
      identity: {
        hostKind: 'electron' as const,
        applicationId: 'neko-desktop',
        windowId: 'window-1',
        viewId: 'view-1',
        workspaceId: workspace.workspaceId,
        connectionId: 'connection-image-history',
      },
      post: async (message: AgentHostToWebviewMessage) => {
        posted.push(message);
      },
    };

    await effects.conversation.readActiveConversation(context);
    await effects.conversation.readConversationSnapshot('conversation-image-history', context);

    const restoredMessages = posted.flatMap((message) =>
      message.type === 'activeConversation' || message.type === 'conversationSnapshot'
        ? (message.conversation?.messages ?? [])
        : [],
    );
    expect(restoredMessages).toHaveLength(2);
    for (const message of restoredMessages) {
      const toolCall = message.contentBlocks?.[0]?.toolCall;
      const image = (toolCall?.result?.data as { images?: unknown[] } | undefined)?.images?.[0];
      const thumbnailRef = toolCall?.result?.perceptionCards?.[0]?.perceptual?.thumbnailRef;
      expect(image).toMatchObject({
        contentLocator: locator,
        previewDescriptor: {
          contentLocator: locator,
          url: 'openneko://resource/ffffffffffffffffffffffffffffffff/content',
        },
      });
      expect(thumbnailRef).toMatchObject({
        contentLocator: locator,
        previewDescriptor: {
          contentLocator: locator,
          url: 'openneko://resource/ffffffffffffffffffffffffffffffff/content',
        },
      });
    }
    expect(registerBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection-image-history',
        sessionId: 'agent-display:conversation-image-history:history:conversation-image-history',
      }),
      expect.objectContaining({ bytes, mediaType: 'image/png' }),
    );

    effects.dispose();
    await composition.dispose?.();
  });

  it('projects completed initial Turn facts into the later exact Session connection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-initial-facts-'));
    temporaryRoots.push(root);
    const configPath = join(root, 'config.toml');
    await writeFile(
      configPath,
      [
        '[[providers]]',
        'id = "provider-1"',
        'name = "Provider"',
        'type = "openai"',
        'api_url = "https://provider.example.test/v1"',
        'protocol_profile = "openai-chat"',
        'enabled = true',
        'requires_api_key = false',
        '',
        '[[models]]',
        'id = "model-1"',
        'name = "Model"',
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
    await workspace.createConversation('conversation-initial-facts');
    await workspace.createConversation('conversation-sibling');
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
      conversationId: 'conversation-initial-facts',
      turnId: 'turn-initial-facts',
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
      conversationId: 'conversation-initial-facts',
      branchId: 'main',
      turnId: 'turn-initial-facts',
      runId: 'run-initial-facts',
    };
    workspace.startTurn.mockImplementation((input) => {
      input.onSystemPromptComposed?.({
        identity: turnIdentity,
        systemPrompt: 'Final character authoring prompt.',
      });
      input.events?.emit({
        identity: turnIdentity,
        timestamp: 1,
        type: 'skill.activated',
        skillName: 'character-creator',
        source: 'builtin',
        fingerprint: 'sha256:character-creator-fixture',
      });
      input.events?.emit({
        identity: turnIdentity,
        timestamp: 2,
        type: 'usage',
        provider: 'provider-1',
        model: 'model-1',
        usage: {
          input: 12,
          output: 8,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 20,
          cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
        },
      });
      return {
        identity: turnIdentity,
        queueItem: {
          id: 'queue-initial-facts',
          conversationId: input.conversationId,
          content: input.presentationText ?? input.prompt,
          createdAt: 1,
          source: 'composer' as const,
        },
        state: 'active' as const,
        completion: Promise.resolve({
          identity: turnIdentity,
          durability: 'durable',
          projection: {
            conversationId: turnIdentity.conversationId,
            turns: [
              {
                turnId: turnIdentity.turnId,
                runId: turnIdentity.runId,
                messageId: 'message-initial-facts',
                items: [],
                completion: { status: 'completed', completedAt: 3 },
              },
            ],
          },
          configuration: input.configuration,
          path: {
            runtime: 'pi-conversation-runtime',
            transcript: 'pi-session',
            metadata: 'sqlite',
            projection: 'conversation-projection-store',
          },
        }),
      };
    });
    workspace.readConversationEvidence.mockReturnValue({
      workspaceId: workspace.workspaceId,
      conversationId: turnIdentity.conversationId,
      branchId: turnIdentity.branchId,
      piSessionId: 'pi-session-initial-facts',
      writerLeaseId: 'writer-lease-initial-facts',
    });
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: '/Users/fixture',
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
      },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });

    await composition.startInitialTurn?.({
      workspace,
      conversationId: turnIdentity.conversationId,
      turnId: turnIdentity.turnId,
      messageText: 'Create a reviewable character.',
      configuration,
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
      skillName: 'character-creator',
      skillActivationId: 'skill:builtin:character-creator-fixture',
      locale: 'en',
      capabilityConstraint: CONFIGURED_AGENT_TURN_CAPABILITIES,
    });
    const effects = composition.createEffects({
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
      workspace,
      identity: {
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        projectId: 'project-1',
        workspaceId: workspace.workspaceId,
        viewId: 'view-1',
        connectionId: 'session-connection-initial-facts',
      },
      initialConversationId: turnIdentity.conversationId,
    });

    expect(effects.automation?.readLatestTurnIdentity(turnIdentity.conversationId)).toEqual(
      turnIdentity,
    );
    expect(effects.automation?.readLatestTurnIdentity('conversation-sibling')).toBeUndefined();
    expect(effects.automation?.readFacts(turnIdentity)).toMatchObject({
      identity: {
        connection: { connectionId: 'session-connection-initial-facts' },
      },
      receipts: {
        skills: {
          items: [
            {
              name: 'character-creator',
              source: 'builtin',
              fingerprint: 'sha256:character-creator-fixture',
              status: 'injected',
            },
          ],
        },
      },
      usage: { inputTokens: 12, outputTokens: 8, costUsd: 0.3 },
    });
    expect(effects.automation?.readFacts(turnIdentity).receipts.prompts.items).toEqual([
      {
        id: 'desktop-agent-system-prompt',
        source: 'system',
        digest: `sha256:${createHash('sha256')
          .update('Final character authoring prompt.')
          .digest('hex')}`,
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
    let releaseTurn: (() => void) | undefined;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    workspace.startTurn.mockImplementation(
      (input: Parameters<AgentWorkspaceRuntime['startTurn']>[0]) => {
        return {
          identity: turnIdentity,
          queueItem: {
            id: 'queue-board-blocked',
            conversationId: input.conversationId,
            content: input.presentationText ?? input.prompt,
            createdAt: 1,
            source: 'composer' as const,
          },
          state: 'active' as const,
          completion: turnGate.then(() => {
            input.onSystemPromptComposed?.({
              identity: turnIdentity,
              systemPrompt: 'Final Workspace Board delivery prompt.',
            });
            return {
              identity: turnIdentity,
              durability: 'durable' as const,
              projection: {
                conversationId: turnIdentity.conversationId,
                turns: [
                  {
                    turnId: turnIdentity.turnId,
                    runId: turnIdentity.runId,
                    messageId: 'message-board-blocked',
                    items: [],
                    completion: { status: 'completed' as const, completedAt: 1 },
                  },
                ],
              },
              configuration: input.configuration,
              artifactDelivery: {
                status: 'blocked' as const,
                diagnostic: {
                  code: 'workspace-board-read-only',
                  message: 'Host-only detail.',
                },
              },
              path: {
                runtime: 'pi-conversation-runtime' as const,
                transcript: 'pi-session' as const,
                metadata: 'sqlite' as const,
                projection: 'conversation-projection-store' as const,
              },
            };
          }),
        };
      },
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
    const resolveConversationReferences = vi.fn(async () => [
      {
        type: 'file' as const,
        id: 'file:companion-source',
        label: 'source.md',
        summary: 'Authorized source for this turn.',
        data: { text: 'authorized-source' },
      },
    ]);
    const composition = createAgentControllerComposition({
      host: createHost(),
      userHome: root,
      credentialRuntime: createCredentialRuntime(),
      resolveWorkspaceConfig: () => config,
      conversationReferences: { resolve: resolveConversationReferences },
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          release: vi.fn(),
        })),
      },
      contentInteraction: {
        openContent: vi.fn(),
        revealDocument: vi.fn(),
      },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const freezeDomainTurn = vi.fn(async () => undefined);
    const resolveConversationDomainTurnContext = vi.fn(async () => ({
      contextPayloads: [
        {
          type: 'entity' as const,
          id: 'domain-turn-context-1',
          label: 'Domain turn context',
          summary: 'Fresh context for this exact turn.',
          data: { text: 'fresh-domain-context' },
        },
      ],
      onTurnStarted: freezeDomainTurn,
    }));
    const effects = composition.createEffects({
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
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
      readConversationEntryTargetReceipt: async () => authoringReceipt(),
      resolveConversationDomainTurnContext: {
        resolve: resolveConversationDomainTurnContext,
      },
    });
    const posted: AgentHostToWebviewMessage[] = [];
    await effects.conversation.submitTurn(
      {
        source: 'user-message',
        conversationId: turnIdentity.conversationId,
        messageText: 'Create a durable artifact.',
        sessionMode: 'agent',
        locale: 'en',
        turnId: turnIdentity.turnId,
        fileReferences: [
          {
            id: 'file:companion-source',
            label: 'source.md',
            contentLocator: { file: { authority: 'workspace', path: 'source.md' } },
            mediaType: 'text',
          },
        ],
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
    effects.dispose();
    releaseTurn?.();

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
    expect(workspace.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        turnId: turnIdentity.turnId,
        entryTargetReceipt: authoringReceipt(),
        contextPayloads: [
          expect.objectContaining({ id: 'domain-turn-context-1' }),
          expect.objectContaining({ id: 'file:companion-source' }),
        ],
      }),
    );
    expect(resolveConversationDomainTurnContext).toHaveBeenCalledWith({
      conversationId: turnIdentity.conversationId,
      context: {
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
    });
    expect(freezeDomainTurn).toHaveBeenCalledWith(turnIdentity.turnId);
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

    await composition.dispose?.();
  });

  it('drains an accepted Skill Turn before disposing connection facts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-agent-skill-disposal-'));
    temporaryRoots.push(root);
    const config = await createConfiguredWorkspaceConfig(root);
    const workspace = createWorkspace(root);
    await workspace.createConversation('conversation-skill-disposal');
    vi.mocked(workspace.readSkillCatalog).mockResolvedValue({
      records: [
        {
          name: 'review',
          description: 'Review the exact Workspace',
          source: { kind: 'project' },
          fingerprint: 'skill-disposal',
          locator: {
            kind: 'skill',
            value: 'skills/review/SKILL.md',
            fingerprint: 'skill-disposal',
          },
        },
      ],
      diagnostics: [],
      warnings: [],
      commands: { records: [], diagnostics: [] },
    });
    const turnIdentity = {
      workspaceId: workspace.workspaceId,
      conversationId: 'conversation-skill-disposal',
      branchId: 'main',
      turnId: 'turn-skill-disposal',
      runId: 'run-skill-disposal',
    };
    workspace.readConversationEvidence.mockReturnValue({
      workspaceId: workspace.workspaceId,
      conversationId: turnIdentity.conversationId,
      branchId: turnIdentity.branchId,
      piSessionId: 'pi-session-skill-disposal',
      writerLeaseId: 'writer-lease-skill-disposal',
    });
    let releaseTurn: (() => void) | undefined;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    workspace.startTurn.mockImplementation((input) => ({
      identity: turnIdentity,
      queueItem: {
        id: 'queue-skill-disposal',
        conversationId: input.conversationId,
        content: input.presentationText ?? input.prompt,
        createdAt: 1,
        source: 'composer' as const,
      },
      state: 'active' as const,
      completion: turnGate.then(() => {
        input.onSystemPromptComposed?.({
          identity: turnIdentity,
          systemPrompt: 'Final detached Skill prompt.',
        });
        return {
          identity: turnIdentity,
          durability: 'durable' as const,
          projection: {
            conversationId: turnIdentity.conversationId,
            turns: [
              {
                turnId: turnIdentity.turnId,
                runId: turnIdentity.runId,
                messageId: 'message-skill-disposal',
                items: [],
                completion: { status: 'completed' as const, completedAt: 1 },
              },
            ],
          },
          configuration: input.configuration,
          path: {
            runtime: 'pi-conversation-runtime' as const,
            transcript: 'pi-session' as const,
            metadata: 'sqlite' as const,
            projection: 'conversation-projection-store' as const,
          },
        };
      }),
    }));
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
      contentInteraction: { openContent: vi.fn(), revealDocument: vi.fn() },
      configInteraction: { openUserConfig: vi.fn() },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const request = {
      modelCatalogEntryId: 'provider-1:model-1',
      providerId: 'provider-1',
      modelId: 'model-1',
      executionMode: 'ask' as const,
      temperature: 0.7,
      maximumOutputTokens: 4096,
      thinkingBudget: 0,
    };
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
      readConversationConfiguration: async () => ({
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
      }),
      readConversationContext: async () => ({
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      }),
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
      personalSkillOwnerId: 'assistant:default',
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
      post: vi.fn(async () => undefined),
    };

    await effects.skill.invokeInput(
      {
        conversationId: turnIdentity.conversationId,
        input: {
          kind: 'skill',
          catalogEntryId: 'skill:project:skill-disposal',
          skillName: 'review',
          activationId: 'skill:project:skill-disposal',
          args: 'check this',
        },
      },
      context,
    );
    const factsAfterDisposal = effects.automation?.disposeAndReadFacts(turnIdentity);
    let disposalSettled = false;
    void factsAfterDisposal?.then(() => {
      disposalSettled = true;
    });
    await Promise.resolve();
    expect(disposalSettled).toBe(false);

    releaseTurn?.();
    await expect(factsAfterDisposal).resolves.toMatchObject({
      projection: { terminalState: 'completed' },
      receipts: {
        prompts: {
          items: [expect.objectContaining({ id: 'desktop-agent-system-prompt' })],
        },
      },
    });
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });

    expect(() =>
      composition.createEffects({
        readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const effects = composition.createEffects({
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError: vi.fn(),
      canvas: createCanvasIndexService(),
    });
    const effects = composition.createEffects({
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
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
      readConversationContext: async () => ({
        kind: 'workspace',
        workspaceId: workspace.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      }),
      personalSkillOwnerId: 'assistant:default',
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
    vi.mocked(workspace.readRuntimeResidency).mockReturnValue({
      workspaceId: workspace.workspaceId,
      visibleBindingCount: 1,
      releaseRequested: false,
      releasable: false,
      conversations: [
        {
          conversationId: activeTab.conversationId,
          resident: true,
          visibleBindingCount: 1,
          running: true,
          queued: true,
          waitingForInput: false,
          releasable: false,
        },
      ],
    });
    await expect(
      effects.skill.invokeInput(
        {
          conversationId: activeTab.conversationId,
          input: {
            kind: 'command',
            catalogEntryId: 'command:builtin:clear',
            commandId: 'clear',
            handlerId: 'builtin:clear',
          },
        },
        context,
      ),
    ).rejects.toThrow('cannot run while Conversation');
    expect(workspace.clearContext).not.toHaveBeenCalled();
    vi.mocked(workspace.readRuntimeResidency).mockReturnValue({
      workspaceId: workspace.workspaceId,
      visibleBindingCount: 1,
      releaseRequested: false,
      releasable: false,
      conversations: [],
    });
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
    await effects.conversation.sendQueuedMessageNow(
      { conversationId: activeTab.conversationId, queueItemId: 'queued-turn-1' },
      context,
    );
    await effects.conversation.cancelQueuedMessage(
      { conversationId: activeTab.conversationId, queueItemId: 'queued-turn-1' },
      context,
    );
    expect(workspace.readMessageQueue).toHaveBeenCalledWith(activeTab.conversationId);
    expect(workspace.sendQueuedMessageNow).toHaveBeenCalledWith(
      activeTab.conversationId,
      'queued-turn-1',
    );
    expect(workspace.cancelQueuedMessage).toHaveBeenCalledWith(
      activeTab.conversationId,
      'queued-turn-1',
    );
    expect(posted.slice(-4).map((message) => message.type)).toEqual([
      'messageQueueSnapshot',
      'messageQueueSnapshot',
      'agentStateSnapshot',
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
      },
      configInteraction: {
        openUserConfig: vi.fn(),
      },
      reportError,
      canvas: createCanvasIndexService(),
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
    const effects = composition.createEffects({
      workspace,
      identity,
      readConversationCapabilityConstraint: readConfiguredCapabilityConstraint,
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

function authoringReceipt(): AgentEntryTargetReceipt {
  return {
    targetReceiptId: 'target-receipt-1',
    draftId: 'draft-1',
    connectionId: 'connection-1',
    mode: 'authoring',
    binding: {
      kind: 'authoring',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
      authority: { kind: 'project', projectId: 'project-1' },
      target: { kind: 'content-document', documentId: 'document-1' },
    },
  };
}

function createCanvasIndexService() {
  return createCanvasWorkspaceIndexService({
    read: {
      listExactCanvasDocuments: vi.fn(async () => []),
      readExactCanvasSummary: vi.fn(async () => ({
        canvasId: 'neko/boards/story.nkc',
        name: 'Story',
      })),
    },
  });
}

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
    loadDisplayAsset: vi.fn(),
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
      paused: false,
      sequence: 0,
    })),
    sendQueuedMessageNow: vi.fn((conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      paused: false,
      sequence: 0,
    })),
    cancelQueuedMessage: vi.fn(async (conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      paused: false,
      sequence: 0,
    })),
    takeQueuedMessageForEdit: vi.fn(),
    clearMessageQueue: vi.fn(async (conversationId: string) => ({
      conversationId,
      items: [],
      pendingCount: 0,
      paused: false,
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
      commands: { records: [], diagnostics: [] },
    })),
    invokeCommand: vi.fn(),
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

function restoredReadImageEntries(
  contentLocator: import('@neko/content').DocumentEntryContentLocator,
): PiConversationTranscriptEntry[] {
  const assistantMessage: Extract<PiConversationTranscriptEntry, { type: 'message' }> = {
    type: 'message',
    id: 'assistant-image-history',
    parentId: null,
    timestamp: new Date(20).toISOString(),
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'tool-image', name: 'ReadImage', arguments: {} }],
      api: 'openai-completions',
      provider: 'fixture',
      model: 'fixture-model',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'toolUse',
      timestamp: 20,
    },
  };
  const toolResultMessage: Extract<PiConversationTranscriptEntry, { type: 'message' }> = {
    type: 'message',
    id: 'tool-image-history',
    parentId: assistantMessage.id,
    timestamp: new Date(30).toISOString(),
    message: {
      role: 'toolResult',
      toolCallId: 'tool-image',
      toolName: 'ReadImage',
      content: [{ type: 'text', text: '{"image_ref":"cover"}' }],
      details: {
        success: true,
        data: {
          images: [{ label: 'cover.png', mimeType: 'image/png', contentLocator }],
        },
        perceptionCards: [
          {
            assetId: 'cover',
            modality: 'image',
            createdAt: 20,
            layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 4 },
            perceptual: {
              thumbnailRef: {
                assetId: 'cover',
                uri: 'content:cover',
                mimeType: 'image/png',
                contentLocator,
              },
            },
          },
        ],
      },
      isError: false,
      timestamp: 30,
    },
  };
  return [assistantMessage, toolResultMessage];
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
          contentLocator: { file: { authority: 'workspace', path: 'documents/source.pdf' } },
        },
        result: {
          success: true,
          data: {
            contentLocator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
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

async function createConfiguredWorkspaceConfig(
  root: string,
  initialSettings: ReturnType<AssistantRuntimeSettingsPort['snapshot']> = {
    selectedProviderId: 'provider-1',
    selectedModelId: 'model-1',
  },
): Promise<ConfigManager> {
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
  return new ConfigManager({
    userConfigManager: new FileUserConfigManager({ filePath: configPath }),
    assistantRuntimeSettings: createRuntimeSettings(initialSettings),
  });
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

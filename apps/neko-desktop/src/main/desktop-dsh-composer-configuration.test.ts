import { describe, expect, it, vi } from 'vitest';
import type { AssistantConfigState, AssistantSettingsSnapshot } from '@neko/host/settings';

import { createDesktopDshComposerConfiguration } from './desktop-dsh-composer-configuration';

describe('Desktop DSH composer configuration', () => {
  it('projects the workspace-owned model catalog and applies exact model and mode before prompting', async () => {
    const workspaceConfig = createConfig();
    const applicationConfig = createConfig();
    const setSessionConfigOption = vi.fn(async () => ({ configOptions: [] }));
    const setSessionMode = vi.fn(async () => ({}));
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        binding: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        conversationId: 'conversation-1',
      })),
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        })),
      },
      workspaceGrants: {
        resolveAuthorizedWorkspace: vi.fn(async () => ({
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath: '${WORKSPACE}/one',
            displayName: 'Workspace One',
          },
        })),
      },
      configuration: {
        getApplicationConfig: () => applicationConfig,
        getWorkspaceConfig: vi.fn(() => workspaceConfig),
      },
      sessions: { setSessionConfigOption, setSessionMode },
    });

    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).resolves.toMatchObject({
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      executionMode: 'ask',
      modes: [
        { id: 'plan', available: false },
        { id: 'ask', available: true },
        { id: 'auto', available: true },
      ],
    });

    await service.selectModel({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      modelOptionId: 'openai:gpt-5',
    });
    expect(workspaceConfig.setAssistantSettings).toHaveBeenCalledWith({
      selectedProviderId: 'openai',
      selectedModelId: 'gpt-5',
    });
    expect(setSessionConfigOption).toHaveBeenCalledWith(
      'conversation-1',
      'model',
      '["openai","gpt-5",8192]',
    );
    expect(setSessionMode).toHaveBeenCalledWith('conversation-1', 'ask');
    expect(applicationConfig.setAssistantSettings).not.toHaveBeenCalled();
  });

  it('rejects Plan and a missing authoritative Conversation context visibly', async () => {
    const config = createConfig();
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      workspaceGrants: {
        resolveAuthorizedWorkspace: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: {
        getApplicationConfig: () => config,
        getWorkspaceConfig: () => config,
      },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        setSessionMode: vi.fn(async () => ({})),
      },
    });

    await expect(
      service.selectMode({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        mode: 'plan',
      }),
    ).rejects.toThrow(/Plan mode is not implemented/u);
    await expect(service.applyConversation('conversation-missing')).rejects.toThrow(
      /no authoritative domain context/u,
    );
  });
});

function createConfig() {
  let state = createState();
  return {
    getAssistantConfigState: vi.fn(() => state),
    setAssistantSettings: vi.fn(async (updates: Partial<AssistantSettingsSnapshot>) => {
      state = { ...state, ...updates };
    }),
  };
}

function createState(): AssistantConfigState {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: 'deepseek-official',
    selectedModelId: 'deepseek-v4',
    customSystemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.7,
    maxTokens: 8192,
    executionMode: 'ask',
    chatModelOptions: [
      {
        id: 'deepseek-official:deepseek-v4',
        label: 'DeepSeek V4',
        providerId: 'deepseek-official',
        modelId: 'deepseek-v4',
      },
      {
        id: 'openai:gpt-5',
        label: 'GPT-5',
        providerId: 'openai',
        modelId: 'gpt-5',
      },
    ],
    modelGroups: [],
    defaultMediaModels: {},
  };
}

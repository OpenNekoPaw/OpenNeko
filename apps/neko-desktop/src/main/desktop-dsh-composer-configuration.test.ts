import { describe, expect, it, vi } from 'vitest';
import type {
  AgentModelPurpose,
  AssistantConfigState,
  AssistantSettingsSnapshot,
  ConfigManager,
} from '@neko/host/settings';

import { createDesktopDshComposerConfiguration } from './desktop-dsh-composer-configuration';

describe('Desktop DSH composer configuration', () => {
  it('projects workspace models and DSH permission presets through their canonical owners', async () => {
    const workspaceConfig = createConfig();
    const applicationConfig = createConfig();
    const setSessionConfigOption = vi.fn(async () => ({ configOptions: [] }));
    const restoreWorkspace = vi.fn(async () => ({
      workspace: {
        workspaceId: 'workspace-1',
        workspacePath: '${WORKSPACE}/one',
        displayName: 'Workspace One',
      },
    }));
    const setPermissionPreset = vi.fn(async (_conversationId: string, permissionPresetId: string) =>
      permissionPresets(permissionPresetId),
    );
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
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
        restore: restoreWorkspace,
      },
      configuration: {
        getApplicationConfig: () => applicationConfig,
        getWorkspaceConfig: vi.fn(() => workspaceConfig),
      },
      sessions: { setSessionConfigOption },
      executionCatalog: createExecutionCatalog(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: setPermissionPreset,
      },
    });

    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).resolves.toMatchObject({
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      selectedMediaModelOptionIds: { image: 'nekoapi-media:gpt-image-2' },
      permissionPresetId: 'workspace-write',
      permissionPresets: [
        { id: 'read-only', label: 'read-only', selectable: true },
        { id: 'workspace-write', label: 'workspace-write', selectable: true },
        { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
      ],
    });
    expect(restoreWorkspace).toHaveBeenCalledWith('window-1', 'grant-1', 'workspace-1');

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
      '["openai","gpt-5-api",8192]',
    );
    expect(applicationConfig.setAssistantSettings).not.toHaveBeenCalled();

    await expect(
      service.selectPermissionPreset({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        permissionPresetId: 'danger-full-access',
      }),
    ).resolves.toMatchObject({ permissionPresetId: 'danger-full-access' });
    expect(setPermissionPreset).toHaveBeenCalledWith('conversation-1', 'danger-full-access');

    await service.selectMediaModel({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      category: 'image',
      modelOptionId: 'nekoapi-media:gpt-image-2',
    });
    expect(workspaceConfig.setDefaultModelPurposeRefs).toHaveBeenCalledWith({
      'image.generate': { providerId: 'nekoapi-media', modelId: 'gpt-image-2' },
    });
    await expect(
      service.selectMediaModel({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        category: 'video',
        modelOptionId: 'nekoapi-media:gpt-image-2',
      }),
    ).rejects.toThrow(/Composer video model/u);
  });

  it('rejects unadvertised presets and a missing authoritative Conversation context visibly', async () => {
    const config = createConfig();
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: {
        getApplicationConfig: () => config,
        getWorkspaceConfig: () => config,
      },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      },
      executionCatalog: createExecutionCatalog(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    await expect(
      service.selectPermissionPreset({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        permissionPresetId: 'auto',
      }),
    ).rejects.toThrow(/not advertised by the runtime/u);
    await expect(service.applyConversation('conversation-missing', 'window-1')).rejects.toThrow(
      /no authoritative domain context/u,
    );
  });

  it('hides non-executable LLMs without removing media models and rejects their selection', async () => {
    const config = createConfig();
    const executionCatalog = createExecutionCatalog({ includeDeepSeek: false });
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: {
        getApplicationConfig: () => config,
        getWorkspaceConfig: () => config,
      },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      },
      executionCatalog,
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    const projected = await service.project({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
    });
    expect(projected.models.map((model) => model.id)).toEqual([
      'openai:gpt-5',
      'nekoapi-media:gpt-image-2',
    ]);
    expect(projected.selectedModelOptionId).toBeUndefined();
    expect(projected.diagnostic).toBe('The selected chat model is not executable by DSH.');

    await expect(
      service.selectModel({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        modelOptionId: 'deepseek-official:deepseek-v4',
      }),
    ).rejects.toThrow(/not executable by the current DSH runtime/u);
    expect(config.setAssistantSettings).not.toHaveBeenCalled();
  });
});

function createExecutionCatalog(options: { readonly includeDeepSeek?: boolean } = {}) {
  const models = new Map<string, Map<string, string>>([
    ['openai', new Map([['gpt-5', 'gpt-5-api']])],
  ]);
  if (options.includeDeepSeek !== false) {
    models.set('deepseek-official', new Map([['deepseek-v4', 'deepseek-v4-api']]));
  }
  return {
    resolve(providerId: string, productModelId: string) {
      const apiModelName = models.get(providerId)?.get(productModelId);
      return apiModelName === undefined ? undefined : { providerId, productModelId, apiModelName };
    },
  };
}

function permissionPresets(currentValue: string) {
  return {
    currentValue,
    options: [
      { value: 'read-only', name: 'read-only' },
      { value: 'workspace-write', name: 'workspace-write' },
      { value: 'danger-full-access', name: 'danger-full-access' },
    ],
  };
}

function createConfig() {
  let state = createState();
  return {
    getAssistantConfigState: vi.fn(() => state),
    setAssistantSettings: vi.fn(async (updates: Partial<AssistantSettingsSnapshot>) => {
      state = { ...state, ...updates };
    }),
    setDefaultModelPurposeRefs: vi.fn(
      async (updates: Parameters<ConfigManager['setDefaultModelPurposeRefs']>[0]) => {
        const defaultMediaModels = { ...state.defaultMediaModels };
        for (const [purpose, ref] of Object.entries(updates) as [
          AgentModelPurpose,
          NonNullable<(typeof updates)[AgentModelPurpose]> | undefined,
        ][]) {
          if (!ref) continue;
          const category = purpose.replace('.generate', '');
          if (category !== 'image' && category !== 'video' && category !== 'audio') {
            throw new Error(`Unexpected media purpose '${purpose}'.`);
          }
          defaultMediaModels[category] = `${ref.providerId}:${ref.modelId}`;
        }
        state = { ...state, defaultMediaModels };
      },
    ),
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
        providerLabel: 'DeepSeek',
        category: 'llm',
        capabilities: ['chat'],
      },
      {
        id: 'openai:gpt-5',
        label: 'GPT-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        providerLabel: 'OpenAI',
        category: 'llm',
        capabilities: ['chat'],
      },
      {
        id: 'nekoapi-media:gpt-image-2',
        label: 'GPT Image 2',
        providerId: 'nekoapi-media',
        modelId: 'gpt-image-2',
        providerLabel: 'NekoAPI Media',
        category: 'image',
        capabilities: ['image.generate'],
      },
    ],
    modelGroups: [],
    defaultMediaModels: { image: 'nekoapi-media:gpt-image-2' },
  };
}

import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import {
  projectChatWorkspaceModelState,
  projectConfigStateMessage,
  projectMediaModelSelectionDefaults,
  projectMediaModelSelectionForSessionModeChange,
  projectMessageModelSelection,
  projectPluginCommandsMessage,
  projectPluginsAvailableMessage,
  projectProjectFilesMessage,
  projectSettingsDataMessage,
  projectSettingsMutationError,
} from '../config-message-presenter';
import { buildConfigChangedMessage, buildConfigStateMessage } from '@neko-agent/types';

describe('config message presenter', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('projects settings data without overwriting configured providers', () => {
    expect(
      projectSettingsDataMessage({
        type: 'settingsData',
        conversationId: 'conversation-1',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            isConfigured: true,
            models: [{ id: 'gpt', name: 'GPT', description: 'Chat model' }],
          },
        ],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt',
        systemPrompt: 'Prompt',
        autoExecuteTools: false,
        streamResponses: false,
        showToolCalls: false,
        temperature: 0.2,
        maxTokens: 2048,
        executionMode: 'auto',
        chatModelOptions: [
          {
            id: 'openai:gpt',
            label: 'OpenAI / GPT',
            providerId: 'openai',
            modelId: 'gpt',
            capabilities: ['chat', 'vision'],
            contextWindow: 200000,
          },
        ],
        defaultMediaModels: {
          image: 'image-provider:model',
        },
        mediaUnderstandingModels: {
          image: {
            category: 'image',
            purpose: 'image.understand',
            status: 'auto',
            providerId: 'google',
            modelId: 'gemini-flash',
            optionId: 'google:gemini-flash',
            label: 'Google / Gemini Flash',
            providerLabel: 'Google',
            source: 'explicit-config',
          },
          audio: {
            category: 'audio',
            purpose: 'audio.understand',
            status: 'missing',
          },
          video: {
            category: 'video',
            purpose: 'video.understand',
            status: 'configured',
            providerId: 'google',
            modelId: 'gemini-pro',
            optionId: 'google:gemini-pro',
            label: 'Google / Gemini Pro',
            providerLabel: 'Google',
            source: 'explicit-config',
          },
        },
      }),
    ).toEqual({
      settingsPatch: {
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            isConfigured: true,
            models: [{ id: 'gpt', name: 'GPT', description: 'Chat model' }],
          },
        ],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt',
        systemPrompt: 'Prompt',
        autoExecuteTools: false,
        streamResponses: false,
        showToolCalls: false,
        temperature: 0.2,
        maxTokens: 2048,
        executionMode: 'auto',
        chatModelOptions: [
          {
            id: 'openai:gpt',
            label: 'OpenAI / GPT',
            providerId: 'openai',
            modelId: 'gpt',
            capabilities: ['chat', 'vision'],
            contextWindow: 200000,
          },
        ],
        mediaUnderstandingModels: {
          image: {
            category: 'image',
            purpose: 'image.understand',
            status: 'auto',
            providerId: 'google',
            modelId: 'gemini-flash',
            optionId: 'google:gemini-flash',
            label: 'Google / Gemini Flash',
            providerLabel: 'Google',
            source: 'explicit-config',
          },
          audio: {
            category: 'audio',
            purpose: 'audio.understand',
            status: 'missing',
          },
          video: {
            category: 'video',
            purpose: 'video.understand',
            status: 'configured',
            providerId: 'google',
            modelId: 'gemini-pro',
            optionId: 'google:gemini-pro',
            label: 'Google / Gemini Pro',
            providerLabel: 'Google',
            source: 'explicit-config',
          },
        },
      },
      selectedModel: 'openai:gpt',
      defaultMediaModels: {
        image: 'image-provider:model',
      },
    });
  });

  it('ignores malformed media understanding projections', () => {
    expect(
      projectSettingsDataMessage({
        type: 'settingsData',
        conversationId: 'conversation-1',
        mediaUnderstandingModels: {
          image: {
            category: 'image',
            purpose: 'video.understand',
            status: 'auto',
          },
          audio: {
            category: 'audio',
            purpose: 'audio.understand',
            status: 'missing',
          },
          video: {
            category: 'video',
            purpose: 'video.understand',
            status: 'configured',
          },
        },
      }).settingsPatch.mediaUnderstandingModels,
    ).toBeUndefined();
  });

  it('projects project files and mention extras into mention items', () => {
    expect(
      projectProjectFilesMessage({
        type: 'projectFiles',
        conversationId: 'conv-1',
        files: [
          {
            path: 'src/index.ts',
            name: 'index.ts',
            type: 'file',
            icon: 'TS',
            source: 'workspace',
          },
        ],
        mentionExtras: [
          {
            type: 'character',
            id: 'char-1',
            label: 'Hero',
            summary: 'Main character',
            source: 'story',
          },
          {
            type: 'media',
            id: 'media-1',
            label: 'Hero portrait',
            summary: 'Media: Hero portrait',
            searchText: '小橘 alias',
            source: 'media-library',
            icon: '🎭',
            filePath: 'neko/assets/Characters/hero.png',
            mediaType: 'image',
            entityType: 'character',
            navigationData: { partition: 'media-library' },
          },
        ],
      }),
    ).toEqual({
      projectFiles: [
        {
          path: 'src/index.ts',
          name: 'index.ts',
          type: 'file',
          icon: 'TS',
          source: 'workspace',
        },
      ],
      mentionItems: [
        {
          id: 'file:src/index.ts',
          kind: 'file',
          label: 'index.ts',
          description: 'src/index.ts',
          filePath: 'src/index.ts',
          icon: 'TS',
          source: 'workspace',
        },
        {
          id: 'character:char-1',
          kind: 'character',
          label: 'Hero',
          description: 'Character',
          contextPayload: {
            type: 'character',
            id: 'char-1',
            label: 'Hero',
            summary: 'Main character',
            data: {
              type: 'character',
              id: 'char-1',
              label: 'Hero',
              summary: 'Main character',
              source: 'story',
            },
          },
          source: 'story',
          searchText: 'Hero Main character',
        },
        {
          id: 'media:media-1',
          kind: 'media',
          label: 'Hero portrait',
          description: 'Media · Image',
          contextPayload: {
            type: 'media',
            id: 'media-1',
            label: 'Hero portrait',
            summary: 'Media: Hero portrait',
            data: {
              type: 'media',
              id: 'media-1',
              label: 'Hero portrait',
              summary: 'Media: Hero portrait',
              source: 'media-library',
              filePath: 'neko/assets/Characters/hero.png',
              mediaType: 'image',
              entityType: 'character',
              navigationData: { partition: 'media-library' },
            },
          },
          icon: '🎭',
          source: 'media-library',
          filePath: 'neko/assets/Characters/hero.png',
          mediaType: 'image',
          entityType: 'character',
          navigationData: { partition: 'media-library' },
          searchText:
            'Hero portrait Media: Hero portrait 小橘 alias neko/assets/Characters/hero.png image character media-library',
        },
      ],
    });
  });

  it('labels semantic Entity Candidates distinctly from confirmed Entities', () => {
    expect(
      projectProjectFilesMessage({
        type: 'projectFiles',
        purpose: 'roleplay',
        mentionExtras: [
          {
            type: 'entity',
            id: 'entity-projection:semantic-xiaoju',
            label: '小橘',
            summary: 'Entity: 小橘 (character candidate)',
            source: 'entity-graph',
            entityType: 'character',
            navigationData: {
              candidateId: 'candidate:auto:character:小橘',
              projectSearchItemId: 'entity-projection:semantic-xiaoju',
            },
          },
        ],
      }).mentionItems,
    ).toEqual([
      expect.objectContaining({
        kind: 'entity',
        label: '小橘',
        description: 'Entity Candidate · Character',
      }),
    ]);
  });

  it('localizes semantic Entity Candidate descriptions for the active webview locale', () => {
    setLocale('zh-cn');

    expect(
      projectProjectFilesMessage({
        type: 'projectFiles',
        purpose: 'roleplay',
        mentionExtras: [
          {
            type: 'entity',
            id: 'entity-projection:semantic-xiaoju',
            label: '小橘',
            summary: 'Entity: 小橘 (character candidate)',
            source: 'entity-graph',
            entityType: 'character',
            navigationData: {
              candidateId: 'candidate:auto:character:小橘',
              projectSearchItemId: 'entity-projection:semantic-xiaoju',
            },
          },
        ],
      }).mentionItems,
    ).toEqual([
      expect.objectContaining({
        kind: 'entity',
        label: '小橘',
        description: '实体候选 · 角色',
      }),
    ]);
  });

  it('applies media model defaults only to empty selections', () => {
    const projection = projectMediaModelSelectionDefaults({
      selection: {
        image: 'none',
        video: 'existing-video',
        audio: 'none',
      },
      defaults: {
        image: 'image-provider:model',
        video: 'video-provider:model',
        audio: 'music-provider:model',
      },
    });

    expect(projection).toEqual({
      selection: {
        image: 'image-provider:model',
        video: 'existing-video',
        audio: 'music-provider:model',
      },
      updated: true,
    });

    expect(
      projectMediaModelSelectionDefaults({
        selection: projection.selection,
        defaults: { image: 'another:model' },
      }),
    ).toEqual({
      selection: projection.selection,
      updated: false,
    });
  });

  it('projects selected chat and media models for sendMessage payloads', () => {
    expect(
      projectMessageModelSelection({
        selectedModel: 'openai:gpt-4.1',
        sessionMode: 'agent',
        agentMediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toEqual({
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      purposeModels: {
        'image.generate': { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      },
    });

    expect(
      projectMessageModelSelection({
        selectedModel: '',
        sessionMode: 'video',
        mediaProviderId: 'runway',
        mediaModelId: 'gen-4',
      }),
    ).toEqual({
      mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
    });

    expect(
      projectMessageModelSelection({
        selectedModel: '',
        sessionMode: 'image',
        mediaProviderId: 'openai',
        mediaModelId: 'none',
      }),
    ).toEqual({});

    expect(
      projectMessageModelSelection({
        selectedModel: 'local-gateway:auto',
        sessionMode: 'agent',
        chatModelOptions: [
          {
            id: 'local-gateway:auto',
            label: 'Local Gateway / Auto',
            providerId: 'local-gateway',
            modelId: 'auto',
            category: 'llm',
          },
        ],
      }),
    ).toEqual({
      chatModel: { providerId: 'local-gateway', modelId: 'auto', category: 'llm' },
    });
  });

  it('projects chat workspace model lists and agent media selections', () => {
    const projection = projectChatWorkspaceModelState({
      chatModelOptions: [
        {
          id: 'openai:gpt-4.1',
          label: 'OpenAI / GPT 4.1',
          providerId: 'openai',
          modelId: 'gpt-4.1',
          category: 'llm',
          contextWindow: 200000,
          maxOutputTokens: 128000,
        },
        {
          id: 'flux:pro',
          label: 'Flux / Pro',
          providerId: 'flux',
          modelId: 'pro',
          category: 'image',
        },
        {
          id: 'runway:gen-4',
          label: 'Runway / Gen 4',
          providerId: 'runway',
          modelId: 'gen-4',
          category: 'video',
        },
        {
          id: 'suno:chirp',
          label: 'Suno / Chirp',
          providerId: 'suno',
          modelId: 'chirp',
          category: 'audio',
          capabilities: ['audio.music.generate'],
        },
      ],
      selectedModel: 'openai:gpt-4.1',
      defaultMaxOutputTokens: 8192,
      sessionMode: 'agent',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'suno:chirp',
      },
    });

    expect(projection.availableModels.map((model) => model.id)).toEqual(['openai:gpt-4.1']);
    expect(projection.availableMediaModels.map((model) => model.id)).toEqual([
      'flux:pro',
      'runway:gen-4',
      'suno:chirp',
    ]);
    expect(projection.activeMediaModel).toBeUndefined();
    expect(projection.agentMediaModels).toEqual({
      image: { providerId: 'flux', modelId: 'pro', category: 'image' },
      video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      audio: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
    });
    expect(projection.selectedContextWindow).toBe(200000);
    expect(projection.selectedEffectiveInputBudget).toBe(200000);
    expect(projection.selectedOutputTokenCap).toBe(8192);
    expect(projection.selectedMaxOutputTokens).toBe(128000);
  });

  it('projects direct media mode active model and default model list', () => {
    expect(
      projectChatWorkspaceModelState({
        chatModelOptions: [],
        selectedModel: '',
        defaultMaxOutputTokens: 4096,
        sessionMode: 'agent',
        mediaModelSelection: { image: 'none', video: 'none', audio: 'none' },
      }),
    ).toMatchObject({
      allModels: [],
      availableModels: [],
      availableMediaModels: [],
      selectedOutputTokenCap: 4096,
    });

    const directProjection = projectChatWorkspaceModelState({
      chatModelOptions: [
        {
          id: 'runway:gen-4',
          label: 'Runway / Gen 4',
          providerId: 'runway',
          modelId: 'gen-4',
          category: 'video',
        },
      ],
      selectedModel: 'missing:model',
      defaultMaxOutputTokens: 4096,
      sessionMode: 'video',
      mediaModelSelection: {
        image: 'none',
        video: 'runway:gen-4',
        audio: 'none',
      },
    });

    expect(directProjection.activeMediaModel?.id).toBe('runway:gen-4');
    expect(directProjection.agentMediaModels).toBeUndefined();
    expect(directProjection.selectedContextWindow).toBeUndefined();
    expect(directProjection.selectedEffectiveInputBudget).toBeUndefined();
    expect(directProjection.selectedMaxOutputTokens).toBeUndefined();
  });

  it('does not use the default output-token cap as a context-window fallback', () => {
    const projection = projectChatWorkspaceModelState({
      chatModelOptions: [
        {
          id: 'openai:custom',
          label: 'OpenAI / Custom',
          providerId: 'openai',
          modelId: 'custom',
          category: 'llm',
          maxOutputTokens: 128000,
        },
      ],
      selectedModel: 'openai:custom',
      defaultMaxOutputTokens: 256000,
      sessionMode: 'agent',
      mediaModelSelection: {
        image: 'none',
        video: 'none',
        audio: 'none',
      },
    });

    expect(projection.selectedContextWindow).toBeUndefined();
    expect(projection.selectedEffectiveInputBudget).toBeUndefined();
    expect(projection.selectedOutputTokenCap).toBe(128000);
  });

  it('projects media model selection changes from session mode transitions', () => {
    expect(
      projectMediaModelSelectionForSessionModeChange({
        sessionMode: 'video',
        mediaModelSelection: { image: 'flux:pro', video: 'none', audio: 'none' },
        chatModelOptions: [
          {
            id: 'runway:gen-4',
            label: 'Runway / Gen 4',
            providerId: 'runway',
            modelId: 'gen-4',
            category: 'video',
          },
        ],
      }),
    ).toEqual({
      sessionMode: 'video',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'none',
      },
      updated: true,
    });

    expect(
      projectMediaModelSelectionForSessionModeChange({
        sessionMode: 'agent',
        mediaModelSelection: {
          image: 'flux:pro',
          video: 'runway:gen-4',
          audio: 'none',
        },
        chatModelOptions: [],
      }),
    ).toEqual({
      sessionMode: 'agent',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'none',
      },
      updated: false,
    });

    expect(
      projectMediaModelSelectionForSessionModeChange({
        sessionMode: 'audio',
        mediaModelSelection: {
          image: 'flux:pro',
          video: 'runway:gen-4',
          audio: 'none',
        },
        chatModelOptions: [
          {
            id: 'suno:chirp',
            label: 'Suno / Chirp',
            providerId: 'suno',
            modelId: 'chirp',
            category: 'audio',
            capabilities: ['audio.music.generate'],
          },
        ],
      }),
    ).toEqual({
      sessionMode: 'audio',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'suno:chirp',
      },
      updated: true,
    });
  });

  it('projects config state, plugin commands, plugin availability, and errors', () => {
    const configuredProviders = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai' as const,
        enabled: true,
        isConfigured: true,
        models: [],
      },
    ];

    expect(buildConfigStateMessage({ configuredProviders })).toEqual({
      type: 'configState',
      config: { configuredProviders },
    });
    expect(buildConfigChangedMessage()).toEqual({ type: 'configChanged' });

    expect(
      projectConfigStateMessage({
        type: 'configState',
        config: {
          configuredProviders,
          selectedProviderId: 'openai',
          selectedModelId: 'gpt',
          chatModelOptions: [
            {
              id: 'openai:gpt',
              label: 'OpenAI / GPT',
              providerId: 'openai',
              modelId: 'gpt',
              category: 'llm',
            },
          ],
          defaultMediaModels: { image: 'openai:image' },
          maxTokens: 16384,
          executionMode: 'auto',
          mediaUnderstandingModels: {
            image: {
              category: 'image',
              purpose: 'image.understand',
              status: 'auto',
              providerId: 'google',
              modelId: 'gemini-flash',
              optionId: 'google:gemini-flash',
              label: 'Google / Gemini Flash',
              providerLabel: 'Google',
              source: 'explicit-config',
            },
            audio: {
              category: 'audio',
              purpose: 'audio.understand',
              status: 'missing',
            },
            video: {
              category: 'video',
              purpose: 'video.understand',
              status: 'configured',
              providerId: 'google',
              modelId: 'gemini-pro',
              optionId: 'google:gemini-pro',
              label: 'Google / Gemini Pro',
              providerLabel: 'Google',
              source: 'explicit-config',
            },
          },
          configDiagnostic: {
            code: 'readError',
            filePath: '/home/user/.neko/config.toml',
            message:
              'Unable to read configuration file: /home/user/.neko/config.toml. Check file permissions, then open a new Agent session or tab.',
          },
        },
      }),
    ).toEqual({
      configuredProviders,
      selectedProviderId: 'openai',
      selectedModelId: 'gpt',
      chatModelOptions: [
        {
          id: 'openai:gpt',
          label: 'OpenAI / GPT',
          providerId: 'openai',
          modelId: 'gpt',
          category: 'llm',
        },
      ],
      defaultMediaModels: { image: 'openai:image' },
      maxTokens: 16384,
      executionMode: 'auto',
      mediaUnderstandingModels: {
        image: {
          category: 'image',
          purpose: 'image.understand',
          status: 'auto',
          providerId: 'google',
          modelId: 'gemini-flash',
          optionId: 'google:gemini-flash',
          label: 'Google / Gemini Flash',
          providerLabel: 'Google',
          source: 'explicit-config',
        },
        audio: {
          category: 'audio',
          purpose: 'audio.understand',
          status: 'missing',
        },
        video: {
          category: 'video',
          purpose: 'video.understand',
          status: 'configured',
          providerId: 'google',
          modelId: 'gemini-pro',
          optionId: 'google:gemini-pro',
          label: 'Google / Gemini Pro',
          providerLabel: 'Google',
          source: 'explicit-config',
        },
      },
      configDiagnostic: {
        code: 'readError',
        filePath: '/home/user/.neko/config.toml',
        message:
          'Unable to read configuration file: /home/user/.neko/config.toml. Check file permissions, then open a new Agent session or tab.',
      },
    });

    expect(
      projectConfigStateMessage({
        type: 'configState',
        config: {
          configDiagnostic: {
            code: 'unsupportedWorkspaceProviderDefinition',
            filePath: '/workspace/.neko/config.toml',
            message:
              'Workspace configuration defines provider entries: /workspace/.neko/config.toml. Move provider definitions and credentials to the user config, then open a new Agent session or tab.',
          },
        },
      }),
    ).toEqual({
      configuredProviders: [],
      configDiagnostic: {
        code: 'unsupportedWorkspaceProviderDefinition',
        filePath: '/workspace/.neko/config.toml',
        message:
          'Workspace configuration defines provider entries: /workspace/.neko/config.toml. Move provider definitions and credentials to the user config, then open a new Agent session or tab.',
      },
    });

    expect(
      projectPluginCommandsMessage({
        type: 'pluginCommands',
        commands: [
          {
            id: 'cmd-1',
            name: '/plugin',
            description: 'Run plugin command',
            extensionId: 'plugin.test',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'cmd-1',
        name: '/plugin',
        description: 'Run plugin command',
        extensionId: 'plugin.test',
      },
    ]);

    expect(
      projectPluginsAvailableMessage({
        type: 'pluginsAvailable',
        plugins: { canvas: true },
      }),
    ).toEqual({ canvas: true });

    expect(projectSettingsMutationError({ type: 'settingsUpdated', success: false })).toBe(
      'Settings update failed.',
    );
  });
});

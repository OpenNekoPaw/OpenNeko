import { describe, expect, it } from 'vitest';
import type { ChatModelOption } from '@neko/shared';
import { DEFAULT_GENERATION_PARAMS } from '@/components/ChatView/InputArea/types';
import { projectComposerModeConfig } from '../composer-mode-config-presenter';

const llmModels: ChatModelOption[] = [
  {
    id: 'openai:gpt-5.5',
    label: 'OpenAI / gpt-5.5',
    providerId: 'openai',
    modelId: 'gpt-5.5',
    category: 'llm',
  },
];

const mediaModels: ChatModelOption[] = [
  {
    id: 'image-provider:model-image',
    label: 'Image Provider / Model Image',
    providerId: 'image-provider',
    modelId: 'model-image',
    category: 'image',
  },
  {
    id: 'video-provider:model-video',
    label: 'Video Provider / Model Video',
    providerId: 'video-provider',
    modelId: 'model-video',
    category: 'video',
  },
];

describe('composer-mode-config-presenter', () => {
  it('distinguishes a pending model catalog from an empty catalog', () => {
    const projection = projectComposerModeConfig({
      sessionMode: 'agent',
      selectedModel: '',
      availableModels: [],
      modelCatalogStatus: 'loading',
      mediaModelSelection: { image: 'none', video: 'none', audio: 'none' },
      availableMediaModels: [],
      genCategory: 'image',
      genParams: DEFAULT_GENERATION_PARAMS,
      llmConfig: {},
    });

    expect(projection.agent?.selectedModelLabel).toBe('chat.modelsLoading');
  });

  it('projects Agent model and behavior preset controls', () => {
    const projection = projectComposerModeConfig({
      sessionMode: 'agent',
      selectedModel: 'openai:gpt-5.5',
      availableModels: llmModels,
      mediaModelSelection: { image: 'image-provider:model-image', video: 'none', audio: 'none' },
      availableMediaModels: mediaModels,
      genCategory: 'image',
      genParams: DEFAULT_GENERATION_PARAMS,
      llmConfig: {
        reasoningPreset: 'deep',
        verbosityPreset: 'brief',
        creativityPreset: 'stable',
      },
    });

    expect(projection.mode).toBe('agent');
    expect(projection.agent).toEqual({
      selectedModelId: 'openai:gpt-5.5',
      selectedModelLabel: 'OpenAI / gpt-5.5',
      reasoningLabelKey: 'chat.agentConfig.reasoning.deep',
      verbosityLabelKey: 'chat.agentConfig.verbosity.brief',
      creativityLabelKey: 'chat.agentConfig.creativity.stable',
    });
  });

  it('projects media model and generation parameter controls', () => {
    const projection = projectComposerModeConfig({
      sessionMode: 'video',
      selectedModel: 'openai:gpt-5.5',
      availableModels: llmModels,
      mediaModelSelection: {
        image: 'image-provider:model-image',
        video: 'video-provider:model-video',
        audio: 'none',
      },
      availableMediaModels: mediaModels,
      genCategory: 'image',
      genParams: {
        ...DEFAULT_GENERATION_PARAMS,
        ratio: '9:16',
        resolution: '720p',
        videoDuration: 8,
      },
      llmConfig: {},
    });

    expect(projection.mode).toBe('video');
    expect(projection.media).toEqual({
      category: 'video',
      selectedModelId: 'video-provider:model-video',
      selectedModelLabel: 'Video Provider / Model Video',
      hasModel: true,
      params: ['9:16', '720p', '8s'],
    });
  });

  it('projects auto media duration without adding seconds', () => {
    const projection = projectComposerModeConfig({
      sessionMode: 'video',
      selectedModel: 'openai:gpt-5.5',
      availableModels: llmModels,
      mediaModelSelection: {
        image: 'image-provider:model-image',
        video: 'video-provider:model-video',
        audio: 'none',
      },
      availableMediaModels: mediaModels,
      genCategory: 'image',
      genParams: DEFAULT_GENERATION_PARAMS,
      llmConfig: {},
    });

    expect(projection.media?.params).toEqual(['16:9', '1080p', 'AUTO']);
  });

  it('uses explicit media diagnostic key when the mode has no model', () => {
    const projection = projectComposerModeConfig({
      sessionMode: 'audio',
      selectedModel: 'auto',
      availableModels: llmModels,
      mediaModelSelection: { image: 'none', video: 'none', audio: 'none' },
      availableMediaModels: mediaModels,
      genCategory: 'image',
      genParams: DEFAULT_GENERATION_PARAMS,
      llmConfig: {},
    });

    expect(projection.media?.selectedModelLabel).toBe('chat.generation.model.unconfigured.audio');
    expect(projection.media?.hasModel).toBe(false);
  });
});

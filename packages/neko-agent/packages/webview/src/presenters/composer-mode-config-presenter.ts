import type { ChatModelOption } from '@neko/shared';
import type { AgentLlmConfig, SessionMode } from '@neko-agent/types';
import type {
  GenCategory,
  GenerationDuration,
  GenerationParams,
} from '@/components/ChatView/InputArea/types';
import type { MediaModelSelection } from '@/components/ChatView/InputAreaContext';

export interface ComposerModeConfigProjection {
  readonly mode: SessionMode;
  readonly modeLabelKey: string;
  readonly modeDescriptionKey: string;
  readonly agent?: AgentConfigProjection;
  readonly media?: MediaConfigProjection;
}

export interface AgentConfigProjection {
  readonly selectedModelId: string;
  readonly selectedModelLabel: string;
  readonly reasoningLabelKey: string;
  readonly verbosityLabelKey: string;
  readonly creativityLabelKey: string;
}

export interface MediaConfigProjection {
  readonly category: GenCategory;
  readonly selectedModelId: string;
  readonly selectedModelLabel: string;
  readonly hasModel: boolean;
  readonly params: readonly string[];
}

export function projectComposerModeConfig(input: {
  readonly sessionMode: SessionMode;
  readonly selectedModel: string;
  readonly availableModels: readonly ChatModelOption[];
  readonly modelCatalogStatus?: 'loading' | 'ready';
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly genCategory: GenCategory;
  readonly genParams: GenerationParams;
  readonly llmConfig: AgentLlmConfig;
}): ComposerModeConfigProjection {
  if (input.sessionMode === 'agent') {
    const agent = projectAgentConfig(input);
    return {
      mode: input.sessionMode,
      modeLabelKey: 'chat.sessionMode.agent',
      modeDescriptionKey: 'chat.sessionMode.agentDesc',
      agent,
    };
  }

  const media = projectMediaConfig({
    category: input.sessionMode,
    mediaModelSelection: input.mediaModelSelection,
    availableMediaModels: input.availableMediaModels,
    genParams: input.genParams,
  });

  return {
    mode: input.sessionMode,
    modeLabelKey: `chat.sessionMode.${input.sessionMode}`,
    modeDescriptionKey: `chat.sessionMode.${input.sessionMode}Desc`,
    media,
  };
}

function projectAgentConfig(input: {
  readonly selectedModel: string;
  readonly availableModels: readonly ChatModelOption[];
  readonly modelCatalogStatus?: 'loading' | 'ready';
  readonly llmConfig: AgentLlmConfig;
}): AgentConfigProjection {
  return {
    selectedModelId: input.selectedModel,
    selectedModelLabel: getSelectedModelLabel(
      input.selectedModel,
      input.availableModels,
      input.modelCatalogStatus ?? 'ready',
    ),
    reasoningLabelKey: `chat.agentConfig.reasoning.${input.llmConfig.reasoningPreset ?? 'balanced'}`,
    verbosityLabelKey: `chat.agentConfig.verbosity.${input.llmConfig.verbosityPreset ?? 'standard'}`,
    creativityLabelKey: `chat.agentConfig.creativity.${input.llmConfig.creativityPreset ?? 'creative'}`,
  };
}

function projectMediaConfig(input: {
  readonly category: GenCategory;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly genParams: GenerationParams;
}): MediaConfigProjection {
  const selectedModelId = input.mediaModelSelection[input.category];
  const selectedModel = input.availableMediaModels.find((model) => model.id === selectedModelId);
  return {
    category: input.category,
    selectedModelId,
    selectedModelLabel:
      selectedModel?.label ?? `chat.generation.model.unconfigured.${input.category}`,
    hasModel: Boolean(selectedModel),
    params: projectMediaParamSummary(input.category, input.genParams),
  };
}

function getSelectedModelLabel(
  selectedModel: string,
  availableModels: readonly ChatModelOption[],
  modelCatalogStatus: 'loading' | 'ready',
): string {
  if (modelCatalogStatus === 'loading') return 'chat.modelsLoading';
  return (
    availableModels.find((model) => model.id === selectedModel)?.label ?? 'chat.noModelsAvailable'
  );
}

function projectMediaParamSummary(
  category: GenCategory,
  params: GenerationParams,
): readonly string[] {
  if (category === 'image') {
    return [params.ratio, params.resolution];
  }
  if (category === 'video') {
    return [params.ratio, params.resolution, formatGenerationDuration(params.videoDuration)];
  }
  return [
    `chat.generation.audioType.${params.audioType}`,
    formatGenerationDuration(params.audioDuration),
  ];
}

function formatGenerationDuration(duration: GenerationDuration): string {
  return duration === 'auto' ? 'AUTO' : `${duration}s`;
}

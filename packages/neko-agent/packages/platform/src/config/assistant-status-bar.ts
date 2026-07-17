import type { GenerationModelConfig } from '@neko/shared';
import type { Model } from '../types/provider';

export interface AssistantStatusBarPresentation {
  readonly text: string;
  readonly tooltip: string;
  readonly warning: boolean;
}

export interface BuildAssistantStatusBarPresentationInput {
  readonly enabledModels: readonly Pick<Model, 'name' | 'capabilities'>[];
  readonly generationConfig?: Pick<GenerationModelConfig, 'image' | 'video'>;
}

const STATUS_BAR_ICON = '$(hubot)';
const STATUS_BAR_TOOLTIP = 'OpenNeko AI Assistant — click to open chat';
const DEFAULT_ASSISTANT_LABEL = 'OpenNeko AI';

export function buildAssistantStatusBarPresentation(
  input: BuildAssistantStatusBarPresentationInput,
): AssistantStatusBarPresentation {
  const chatModel = input.enabledModels.find(hasChatCapability);
  const llmLabel = chatModel ? formatLlmModelLabel(chatModel.name) : DEFAULT_ASSISTANT_LABEL;
  const badgeSuffix = buildGenerationModelBadgeSuffix(input.generationConfig);

  return {
    text: `${STATUS_BAR_ICON} ${llmLabel}${badgeSuffix}`,
    tooltip: STATUS_BAR_TOOLTIP,
    warning: !chatModel,
  };
}

function hasChatCapability(model: Pick<Model, 'capabilities'>): boolean {
  return model.capabilities.some((capability) => capability === 'chat');
}

function formatLlmModelLabel(modelName: string): string {
  return modelName.length > 20 ? `${modelName.slice(0, 18)}…` : modelName;
}

function buildGenerationModelBadgeSuffix(
  generationConfig: Pick<GenerationModelConfig, 'image' | 'video'> | undefined,
): string {
  const badges: string[] = [];
  if (generationConfig?.image) {
    badges.push(`✨ ${formatGenerationModelLabel(generationConfig.image)}`);
  }
  if (generationConfig?.video) {
    badges.push(`🎬 ${formatGenerationModelLabel(generationConfig.video)}`);
  }
  return badges.length > 0 ? `  ${badges.join('  ')}` : '';
}

function formatGenerationModelLabel(modelId: string): string {
  const stripped = modelId
    .replace(/^(stability-ai\/|fal-ai\/|black-forest-labs\/|wan-|wan\.)/i, '')
    .replace(/^(flux-)/, 'flux-');
  return stripped.length > 12 ? `${stripped.slice(0, 11)}…` : stripped;
}

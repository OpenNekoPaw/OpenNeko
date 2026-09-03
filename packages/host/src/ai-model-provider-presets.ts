import type { ModelCapability, ModelType } from '@neko/ai-contracts';

export function requiredDesktopAiModelCapabilities(type: ModelType): readonly ModelCapability[] {
  if (type === 'llm') return ['chat', 'llm.chat'];
  if (type === 'image') return ['image.generate'];
  if (type === 'video') return ['video.generate'];
  return ['audio.generate'];
}

export function withRequiredDesktopAiModelCapabilities(
  type: ModelType,
  capabilities: readonly string[],
): readonly string[] {
  const result = [...capabilities];
  for (const capability of requiredDesktopAiModelCapabilities(type)) {
    if (!result.includes(capability)) result.push(capability);
  }
  return result;
}

export function defaultDesktopAiModelCapabilities(type: ModelType): readonly ModelCapability[] {
  if (type === 'llm') return [...requiredDesktopAiModelCapabilities(type), 'streaming'];
  if (type === 'image') return ['text_to_image', ...requiredDesktopAiModelCapabilities(type)];
  if (type === 'video') return ['text_to_video', ...requiredDesktopAiModelCapabilities(type)];
  return ['text_to_audio', ...requiredDesktopAiModelCapabilities(type)];
}

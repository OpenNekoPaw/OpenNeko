import type { Model } from '../types/provider';

export type AgentModelPurpose =
  | 'llm.chat'
  | 'llm.plan'
  | 'llm.judge'
  | 'llm.vision'
  | 'canvas.prompt'
  | 'canvas.judge'
  | 'character.dialogue'
  | 'character.profile'
  | 'text.embed'
  | 'image.generate'
  | 'image.edit'
  | 'image.understand'
  | 'video.generate'
  | 'video.understand'
  | 'video.safety'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.asr'
  | 'audio.understand'
  | 'audio.music.generate'
  | 'content.safety.moderate'
  | 'local.video.probe';

interface PurposeCapabilityRule {
  readonly capabilities: readonly string[];
  readonly modelType?: Model['type'];
}

const PURPOSE_CAPABILITY_MATCHES: Record<AgentModelPurpose, PurposeCapabilityRule> = {
  'llm.chat': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'llm.plan': { capabilities: ['llm.plan', 'chat'], modelType: 'llm' },
  'llm.judge': { capabilities: ['llm.judge', 'chat'], modelType: 'llm' },
  'llm.vision': { capabilities: ['llm.vision', 'vision'], modelType: 'llm' },
  'canvas.prompt': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'canvas.judge': { capabilities: ['llm.judge', 'llm.chat', 'chat'], modelType: 'llm' },
  'character.dialogue': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'character.profile': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'text.embed': { capabilities: ['embedding'] },
  'image.generate': { capabilities: ['image.generate', 'text_to_image', 'image_generation'] },
  'image.edit': { capabilities: ['image.edit', 'image_edit'] },
  'image.understand': { capabilities: ['vision', 'image.understand'], modelType: 'llm' },
  'video.generate': { capabilities: ['video.generate', 'text_to_video', 'video_generation'] },
  'video.understand': { capabilities: ['vision_video', 'video.understand'], modelType: 'llm' },
  'video.safety': { capabilities: ['video.safety'] },
  'audio.generate': { capabilities: ['audio.generate', 'text_to_audio', 'audio'] },
  'audio.tts': { capabilities: ['audio.tts', 'text_to_audio', 'audio'] },
  'audio.asr': { capabilities: ['audio.asr', 'audio'] },
  'audio.understand': { capabilities: ['audio', 'audio.understand'], modelType: 'llm' },
  'audio.music.generate': { capabilities: ['audio.music.generate', 'text_to_music'] },
  'content.safety.moderate': { capabilities: ['content.safety.moderate'] },
  'local.video.probe': { capabilities: ['local.video.probe'] },
};

export const MEDIA_UNDERSTANDING_PURPOSE_CAPABILITIES = {
  'image.understand': 'vision',
  'audio.understand': 'audio',
  'video.understand': 'vision_video',
} as const satisfies Record<
  Extract<AgentModelPurpose, 'image.understand' | 'audio.understand' | 'video.understand'>,
  string
>;

export function getModelPurposeCapabilityMatches(purpose: AgentModelPurpose): readonly string[] {
  return PURPOSE_CAPABILITY_MATCHES[purpose].capabilities;
}

export function modelSupportsPurpose(model: Pick<Model, 'capabilities'>, purpose: string): boolean {
  const modelCapabilities = model.capabilities as readonly string[];
  const rule = PURPOSE_CAPABILITY_MATCHES[purpose as AgentModelPurpose];
  if (!rule) {
    return modelCapabilities.includes(purpose);
  }
  if ('type' in model && rule.modelType && model.type !== rule.modelType) {
    return false;
  }
  return rule.capabilities.some((capability) => modelCapabilities.includes(capability));
}

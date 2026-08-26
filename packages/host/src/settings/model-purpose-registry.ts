import type { Model } from './types/provider';

export type AgentModelPurpose =
  | 'llm.chat'
  | 'llm.plan'
  | 'llm.judge'
  | 'canvas.prompt'
  | 'canvas.judge'
  | 'character.dialogue'
  | 'character.profile'
  | 'text.embed'
  | 'image.generate'
  | 'image.edit'
  | 'video.generate'
  | 'video.safety'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.asr'
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
  'canvas.prompt': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'canvas.judge': { capabilities: ['llm.judge', 'llm.chat', 'chat'], modelType: 'llm' },
  'character.dialogue': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'character.profile': { capabilities: ['llm.chat', 'chat'], modelType: 'llm' },
  'text.embed': { capabilities: ['embedding'] },
  'image.generate': { capabilities: ['image.generate', 'text_to_image'] },
  'image.edit': { capabilities: ['image.edit', 'image_edit'] },
  'video.generate': { capabilities: ['video.generate', 'text_to_video'] },
  'video.safety': { capabilities: ['video.safety'] },
  'audio.generate': { capabilities: ['audio.generate', 'text_to_audio', 'audio'] },
  'audio.tts': { capabilities: ['audio.tts', 'text_to_audio', 'audio'] },
  'audio.asr': { capabilities: ['audio.asr', 'audio'] },
  'audio.music.generate': { capabilities: ['audio.music.generate', 'text_to_music'] },
  'content.safety.moderate': { capabilities: ['content.safety.moderate'] },
  'local.video.probe': { capabilities: ['local.video.probe'] },
};

const PURPOSE_MODEL_TYPE_MATCHES: Partial<Record<AgentModelPurpose, NonNullable<Model['type']>>> = {
  'image.generate': 'image',
  'image.edit': 'image',
  'video.generate': 'video',
  'audio.generate': 'audio',
  'audio.tts': 'audio',
  'audio.asr': 'audio',
  'audio.music.generate': 'audio',
};

export function getModelPurposeCapabilityMatches(purpose: AgentModelPurpose): readonly string[] {
  return PURPOSE_CAPABILITY_MATCHES[purpose].capabilities;
}

export function isAgentModelPurpose(value: string): value is AgentModelPurpose {
  return value in PURPOSE_CAPABILITY_MATCHES;
}

export function modelSupportsPurpose(
  model: {
    readonly capabilities: readonly string[];
    readonly type?: Model['type'];
  },
  purpose: string,
): boolean {
  const modelCapabilities = model.capabilities;
  const canonicalPurpose = purpose as AgentModelPurpose;
  const rule = PURPOSE_CAPABILITY_MATCHES[canonicalPurpose];
  if (!rule) {
    return modelCapabilities.includes(purpose);
  }
  const requiredModelType = PURPOSE_MODEL_TYPE_MATCHES[canonicalPurpose];
  if (requiredModelType) {
    return model.type === requiredModelType;
  }
  if ('type' in model && rule.modelType && model.type !== rule.modelType) {
    return false;
  }
  return rule.capabilities.some((capability) => modelCapabilities.includes(capability));
}

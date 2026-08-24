import type { ChatModelOption, ModelType } from '@neko/ai-contracts';

type Translate = (key: string) => string;

export interface ProviderModelGroup {
  readonly key: string;
  readonly label: string;
  readonly tags: readonly string[];
  readonly models: readonly ChatModelOption[];
}

const VISIBLE_CAPABILITY_TAGS_BY_CATEGORY = {
  llm: [
    ['vision', ['vision', 'llm.vision']],
    ['tools', ['function_calling']],
    ['streaming', ['streaming']],
  ],
  image: [
    ['text_to_image', ['text_to_image', 'image.generate']],
    ['image_to_image', ['image_to_image', 'image.edit']],
    ['image_edit', ['image_edit']],
  ],
  video: [
    ['text_to_video', ['text_to_video', 'video.generate']],
    ['image_to_video', ['image_to_video']],
    ['video_to_video', ['video_to_video']],
    ['video_edit', ['video_edit']],
  ],
  audio: [
    ['text_to_audio', ['text_to_audio', 'audio.generate']],
    ['tts', ['audio.tts']],
    ['asr', ['audio.asr']],
    ['text_to_music', ['text_to_music', 'audio.music.generate']],
  ],
} as const satisfies Record<ModelType, readonly (readonly [string, readonly string[]])[]>;

export function groupModelOptionsByProvider(
  models: readonly ChatModelOption[],
  t: Translate,
): readonly ProviderModelGroup[] {
  const groups = new Map<string, ChatModelOption[]>();
  for (const model of models) {
    groups.set(model.providerId, [...(groups.get(model.providerId) ?? []), model]);
  }

  return Array.from(groups.entries()).map(([providerId, groupModels]) => {
    const first = groupModels[0];
    return {
      key: providerId,
      label: first?.providerLabel ?? inferProviderLabel(first?.label) ?? providerId,
      tags: first ? buildProviderTags(first, t) : [],
      models: groupModels,
    };
  });
}

function buildProviderTags(model: ChatModelOption, t: Translate): readonly string[] {
  const tags: string[] = [];
  if (model.source === 'explicit-config') {
    tags.push(t('chat.modelSource.custom'));
  }
  if (model.connectionKind) {
    tags.push(t(`chat.modelConnection.${model.connectionKind}`));
  }
  return dedupeTags(tags);
}

export function buildModelTags(model: ChatModelOption, t: Translate): readonly string[] {
  const tags: string[] = [];
  const category = model.category ?? 'llm';
  tags.push(t(`chat.modelCategory.${category}`));
  for (const capability of resolveVisibleCapabilityTags(model)) {
    tags.push(t(`chat.modelCapability.${capability}`));
  }
  return dedupeTags(tags);
}

export function shortenModelLabel(
  model: Pick<ChatModelOption, 'label' | 'modelId'>,
  maxLength = 18,
  ellipsis = '…',
): string {
  const label = model.label || model.modelId;
  const short = label.includes('/') ? (label.split('/').pop()?.trim() ?? label) : label;
  return short.length > maxLength
    ? `${short.slice(0, Math.max(0, maxLength - 1))}${ellipsis}`
    : short;
}

function resolveVisibleCapabilityTags(model: ChatModelOption): readonly string[] {
  const capabilities = new Set(model.capabilities ?? []);
  const category = model.category ?? 'llm';
  return VISIBLE_CAPABILITY_TAGS_BY_CATEGORY[category]
    .filter(([, aliases]) => aliases.some((capability) => capabilities.has(capability)))
    .map(([tag]) => tag);
}

function inferProviderLabel(label: string | undefined): string | undefined {
  if (!label?.includes('/')) return undefined;
  return label.split('/')[0]?.trim() || undefined;
}

function dedupeTags(tags: readonly string[]): readonly string[] {
  return Array.from(new Set(tags.filter(Boolean)));
}

import type { ChatModelOption, ModelType } from '@neko/shared';

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
    ['text_to_image', ['text_to_image', 'image.generate', 'image_generation']],
    ['image_to_image', ['image_to_image', 'image.edit']],
    ['image_edit', ['image_edit']],
  ],
  video: [
    ['text_to_video', ['text_to_video', 'video.generate', 'video_generation']],
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
  if (model.source === 'account-gateway') {
    tags.push(readTranslation(t, 'chat.modelSource.official', 'Official'));
  } else if (model.source === 'explicit-config') {
    tags.push(readTranslation(t, 'chat.modelSource.custom', 'Custom'));
  }
  if (model.connectionKind) {
    tags.push(
      readTranslation(
        t,
        `chat.modelConnection.${model.connectionKind}`,
        formatTagValue(model.connectionKind),
      ),
    );
  }
  return dedupeTags(tags);
}

export function buildModelTags(model: ChatModelOption, t: Translate): readonly string[] {
  const tags: string[] = [];
  const category = model.category ?? 'llm';
  tags.push(readTranslation(t, `chat.modelCategory.${category}`, formatTagValue(category)));
  for (const capability of resolveVisibleCapabilityTags(model)) {
    tags.push(
      readTranslation(
        t,
        `chat.modelCapability.${capability}`,
        formatTagValue(capability.replaceAll('_', '-')),
      ),
    );
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

function readTranslation(t: Translate, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

function formatTagValue(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function dedupeTags(tags: readonly string[]): readonly string[] {
  return Array.from(new Set(tags.filter(Boolean)));
}

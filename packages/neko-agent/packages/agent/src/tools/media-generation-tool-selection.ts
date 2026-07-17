import type { AgentMediaModelSelections, MediaModelCategory, ModelRef } from '@neko-agent/types';
import { TOOL_NAMES_MEDIA } from '@neko/shared';

const MEDIA_MODEL_CATEGORIES = ['image', 'video', 'audio'] as const;

type MediaModelCategoryKey = (typeof MEDIA_MODEL_CATEGORIES)[number];

export function projectMediaModelTools(input: {
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
}): string[] {
  if (input.mediaModels && Object.keys(input.mediaModels).length > 0) {
    return dedupeTools([
      ...(input.mediaModels.image ? [TOOL_NAMES_MEDIA.GENERATE_IMAGE] : []),
      ...(input.mediaModels.video ? [TOOL_NAMES_MEDIA.GENERATE_VIDEO] : []),
      ...(input.mediaModels.audio
        ? [TOOL_NAMES_MEDIA.GENERATE_TTS, TOOL_NAMES_MEDIA.GENERATE_MUSIC]
        : []),
    ]);
  }

  if (!input.mediaModel) {
    return [];
  }

  switch (input.mediaModel.category) {
    case 'image':
      return [TOOL_NAMES_MEDIA.GENERATE_IMAGE];
    case 'video':
      return [TOOL_NAMES_MEDIA.GENERATE_VIDEO];
    case 'audio':
      return [TOOL_NAMES_MEDIA.GENERATE_TTS, TOOL_NAMES_MEDIA.GENERATE_MUSIC];
  }
}

export function projectMediaModelToolsFromMetadata(
  metadata: Record<string, unknown> | undefined,
): string[] {
  const mediaModels = metadata?.['mediaModels'];
  if (!isRecord(mediaModels)) {
    return [];
  }

  return dedupeTools(
    MEDIA_MODEL_CATEGORIES.flatMap((category) =>
      hasRuntimeMediaModelRef(mediaModels[category]) ? toolsForMediaCategory(category) : [],
    ),
  );
}

function toolsForMediaCategory(category: MediaModelCategoryKey): string[] {
  switch (category) {
    case 'image':
      return [TOOL_NAMES_MEDIA.GENERATE_IMAGE];
    case 'video':
      return [TOOL_NAMES_MEDIA.GENERATE_VIDEO];
    case 'audio':
      return [TOOL_NAMES_MEDIA.GENERATE_TTS, TOOL_NAMES_MEDIA.GENERATE_MUSIC];
  }
}

function hasRuntimeMediaModelRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['providerId'] === 'string' &&
    value['providerId'].length > 0 &&
    typeof value['modelId'] === 'string' &&
    value['modelId'].length > 0
  );
}

function dedupeTools(tools: readonly string[]): string[] {
  return [...new Set(tools)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

import type { ChatModelOption } from '@neko/shared';
import type { MediaUnderstandingModelSelections } from '@neko-agent/types';
import type { TuiMediaCategory, TuiPerceptionModels } from './types';

type TuiMediaModelDefaults = Partial<Record<TuiMediaCategory, string>>;

interface RuntimeMediaModelRef {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
}

type RuntimeMediaModelRefs = Partial<Record<TuiMediaCategory, RuntimeMediaModelRef>>;

export function mergeTuiMediaModelMetadata(
  metadata: Record<string, unknown> | undefined,
  defaults: TuiMediaModelDefaults | undefined,
  defaultProviderId: string,
  modelOptions: readonly ChatModelOption[] = [],
  perceptionModels?: TuiPerceptionModels,
): Record<string, unknown> | undefined {
  const mediaModels = buildTuiMediaModelMetadata(defaults, defaultProviderId, modelOptions);
  const understandingModels = buildTuiPerceptionModelMetadata(
    perceptionModels,
    defaultProviderId,
    modelOptions,
  );
  if (Object.keys(mediaModels).length === 0 && Object.keys(understandingModels).length === 0) {
    return metadata;
  }
  return {
    ...(metadata ?? {}),
    ...(Object.keys(mediaModels).length > 0 ? { mediaModels } : {}),
    ...(Object.keys(understandingModels).length > 0 ? { understandingModels } : {}),
  };
}

export function buildTuiMediaModelMetadata(
  defaults: TuiMediaModelDefaults | undefined,
  defaultProviderId: string,
  modelOptions: readonly ChatModelOption[] = [],
): RuntimeMediaModelRefs {
  const mediaModels: RuntimeMediaModelRefs = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const ref = parseTuiMediaModelRef(
      defaults?.[category],
      defaultProviderId,
      category,
      modelOptions,
    );
    if (ref) {
      mediaModels[category] = ref;
    }
  }
  return mediaModels;
}

export function buildTuiPerceptionModelMetadata(
  perceptionModels: TuiPerceptionModels | undefined,
  defaultProviderId: string,
  modelOptions: readonly ChatModelOption[] = [],
): MediaUnderstandingModelSelections {
  const understandingModels: MediaUnderstandingModelSelections = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const ref = parseTuiPerceptionModelRef(
      perceptionModels?.[category],
      defaultProviderId,
      category,
      modelOptions,
    );
    if (ref) {
      understandingModels[category] = ref;
    }
  }
  return understandingModels;
}

function parseTuiMediaModelRef(
  rawRef: string | undefined,
  defaultProviderId: string,
  category: TuiMediaCategory,
  modelOptions: readonly ChatModelOption[],
): RuntimeMediaModelRef | null {
  const ref = rawRef?.trim();
  if (!ref || ref === 'none') {
    return null;
  }

  const option = modelOptions.find(
    (candidate) =>
      candidate.category === category &&
      (candidate.id === ref ||
        candidate.modelId === ref ||
        `${candidate.providerId}:${candidate.modelId}` === ref ||
        `${candidate.providerId}/${candidate.modelId}` === ref),
  );
  if (option) {
    return {
      providerId: option.providerId,
      modelId: option.modelId,
      ...(option.providerExpressionProfileId
        ? { providerExpressionProfileId: option.providerExpressionProfileId }
        : {}),
    };
  }

  const separator = ref.includes('/') ? '/' : ref.includes(':') ? ':' : null;
  if (!separator) {
    return { providerId: defaultProviderId, modelId: ref };
  }

  const [providerId, modelId] = ref.split(separator, 2);
  if (!providerId || !modelId) {
    throw new Error(`Invalid media model reference: ${ref}`);
  }
  return { providerId, modelId };
}

function parseTuiPerceptionModelRef(
  rawRef: string | undefined,
  defaultProviderId: string,
  category: TuiMediaCategory,
  modelOptions: readonly ChatModelOption[],
): MediaUnderstandingModelSelections[TuiMediaCategory] | null {
  const ref = rawRef?.trim();
  if (!ref || ref === 'auto') {
    return null;
  }

  const option = modelOptions.find(
    (candidate) =>
      candidate.category === 'llm' &&
      supportsPerceptionCategory(candidate, category) &&
      (candidate.id === ref ||
        candidate.modelId === ref ||
        `${candidate.providerId}:${candidate.modelId}` === ref ||
        `${candidate.providerId}/${candidate.modelId}` === ref),
  );
  if (option) {
    return {
      providerId: option.providerId,
      modelId: option.modelId,
      category: 'llm',
      ...(option.providerExpressionProfileId
        ? { providerExpressionProfileId: option.providerExpressionProfileId }
        : {}),
    };
  }

  const separator = ref.includes('/') ? '/' : ref.includes(':') ? ':' : null;
  if (!separator) {
    return { providerId: defaultProviderId, modelId: ref, category: 'llm' };
  }

  const [providerId, modelId] = ref.split(separator, 2);
  if (!providerId || !modelId) {
    throw new Error(`Invalid perception model reference: ${ref}`);
  }
  return { providerId, modelId, category: 'llm' };
}

export function supportsPerceptionCategory(
  option: ChatModelOption,
  category: TuiMediaCategory,
): boolean {
  const capabilities = new Set(option.capabilities ?? []);
  if (category === 'image')
    return capabilities.has('vision') || capabilities.has('image.understand');
  if (category === 'audio')
    return capabilities.has('audio') || capabilities.has('audio.understand');
  return capabilities.has('vision_video') || capabilities.has('video.understand');
}

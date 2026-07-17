import type { Platform } from '@neko/platform';
import { projectLlmParameters, type LlmParameterDiagnostic } from '@neko/platform';
import type {
  AgentLlmConfig,
  AgentMediaModelSelections,
  AgentModelSlot,
  AgentModelSlots,
  MediaUnderstandingModelSelections,
  ModelRef,
} from '@neko-agent/types';
import type { AgentFlatPurposeModelRefs, AgentLlmRuntimeOptions } from '@neko/agent/runtime';
import type { MessageAttachment } from '@neko/shared';
import type { ProviderManager } from './providerManager';
import type { AssistantRuntimeSettingsSnapshot } from '@neko/platform';

export type AgentLlmConfigDiagnosticCode =
  | 'conflicting-media-understanding-purposes'
  | 'missing-media-understanding-model'
  | 'unsupported-agent-model-slot'
  | 'conflicting-primary-model'
  | 'missing-primary-model'
  | 'incomplete-primary-model'
  | 'missing-primary-provider'
  | 'primary-provider-not-configured'
  | 'primary-model-not-found'
  | 'primary-model-provider-mismatch'
  | 'primary-model-not-llm'
  | 'incompatible-llm-parameter'
  | 'unsupported-llm-parameter';

export interface AgentLlmConfigDiagnostic {
  readonly code: AgentLlmConfigDiagnosticCode;
  readonly message: string;
  readonly slot?: AgentModelSlot;
  readonly field?: string;
}

export interface ResolveAgentLlmConfigInput {
  readonly sessionMode: string;
  readonly chatModel?: ModelRef<'llm'>;
  readonly agentModels?: AgentModelSlots;
  readonly llmConfig?: AgentLlmConfig;
  readonly attachments?: readonly MessageAttachment[];
  readonly understandingModels?: MediaUnderstandingModelSelections;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly purposeModels?: AgentFlatPurposeModelRefs;
  readonly settings: AssistantRuntimeSettingsSnapshot;
  readonly providers: ProviderManager;
  readonly platform?: Platform;
}

export type ResolveAgentLlmConfigResult =
  | {
      readonly ok: true;
      readonly chatModel?: ModelRef<'llm'>;
      readonly agentModels?: AgentModelSlots;
      readonly understandingModels?: MediaUnderstandingModelSelections;
      readonly purposeModels?: AgentFlatPurposeModelRefs;
      readonly llmConfig?: AgentLlmConfig;
      readonly llmRuntimeOptions?: AgentLlmRuntimeOptions;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly AgentLlmConfigDiagnostic[];
    };

const MVP_AGENT_MODEL_SLOTS = new Set<AgentModelSlot>(['primary']);

export function resolveAgentLlmConfigForTurn(
  input: ResolveAgentLlmConfigInput,
): ResolveAgentLlmConfigResult {
  if (input.sessionMode !== 'agent') {
    return { ok: true };
  }

  const diagnostics: AgentLlmConfigDiagnostic[] = [];
  diagnostics.push(...validateUnsupportedSlots(input.agentModels));

  const resolvedPrimaryCandidate =
    input.agentModels?.primary ?? input.chatModel ?? resolveDefaultPrimaryModel(input);
  const mediaUnderstandingResolution = resolveMediaUnderstandingPrimaryModel(input);
  if (mediaUnderstandingResolution.status === 'blocked') {
    diagnostics.push(...mediaUnderstandingResolution.diagnostics);
    return { ok: false, diagnostics };
  }

  const mediaUnderstandingModel =
    mediaUnderstandingResolution.status === 'resolved'
      ? mediaUnderstandingResolution.model
      : undefined;
  const mediaUnderstandingCategory =
    mediaUnderstandingResolution.status === 'resolved'
      ? purposeToCategory(mediaUnderstandingResolution.purpose)
      : undefined;
  const primaryModel =
    mediaUnderstandingModel &&
    resolvedPrimaryCandidate &&
    sameModelRef(mediaUnderstandingModel, resolvedPrimaryCandidate)
      ? mediaUnderstandingModel
      : input.agentModels?.primary;
  if (
    primaryModel &&
    input.chatModel &&
    !mediaUnderstandingModel &&
    !sameModelRef(primaryModel, input.chatModel)
  ) {
    diagnostics.push({
      code: 'conflicting-primary-model',
      slot: 'primary',
      message:
        'Agent primary model conflicts with the chat model selection. Choose one provider/model for this Agent turn.',
    });
  }

  const resolvedPrimary = primaryModel ?? input.chatModel ?? resolveDefaultPrimaryModel(input);
  if (!resolvedPrimary) {
    diagnostics.push(resolveMissingPrimaryModelDiagnostic(input));
    return { ok: false, diagnostics };
  }

  diagnostics.push(...validatePrimaryModel(input, resolvedPrimary));

  const projection = projectResolvedLlmRuntimeOptions(input, resolvedPrimary);
  if (projection.blockingDiagnostics.length > 0) {
    diagnostics.push(...projection.blockingDiagnostics);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    chatModel: resolvedPrimary,
    agentModels: { primary: resolvedPrimary },
    ...projectFlatPurposeModels(input, mediaUnderstandingResolution),
    ...(mediaUnderstandingModel &&
    mediaUnderstandingCategory &&
    !sameModelRef(mediaUnderstandingModel, resolvedPrimary)
      ? {
          understandingModels: {
            ...input.understandingModels,
            [mediaUnderstandingCategory]: mediaUnderstandingModel,
          },
        }
      : {}),
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
    ...(projection.runtimeOptions ? { llmRuntimeOptions: projection.runtimeOptions } : {}),
  };
}

type MediaUnderstandingPurpose = 'image.understand' | 'audio.understand' | 'video.understand';

type MediaUnderstandingPrimaryResolution =
  | { readonly status: 'none' }
  | {
      readonly status: 'resolved';
      readonly purpose: MediaUnderstandingPurpose;
      readonly model: ModelRef<'llm'>;
    }
  | { readonly status: 'blocked'; readonly diagnostics: readonly AgentLlmConfigDiagnostic[] };

function resolveMediaUnderstandingPrimaryModel(
  input: ResolveAgentLlmConfigInput,
): MediaUnderstandingPrimaryResolution {
  const purposes = getRequestedMediaUnderstandingPurposes(input.attachments);
  if (purposes.length === 0) {
    return { status: 'none' };
  }

  if (purposes.length > 1) {
    return {
      status: 'blocked',
      diagnostics: [
        {
          code: 'conflicting-media-understanding-purposes',
          slot: 'primary',
          message:
            'This Agent turn includes multiple media understanding types. Send image, audio, and video analysis separately until multi-model media analysis profiles are available.',
        },
      ],
    };
  }

  const purpose = purposes[0];
  const selected =
    input.purposeModels?.[purpose] ?? input.understandingModels?.[purposeToCategory(purpose)];
  if (selected) {
    return { status: 'resolved', purpose, model: selected };
  }

  const configured = input.platform?.config.resolveModelRefForPurpose(purpose);
  if (!configured) {
    return {
      status: 'blocked',
      diagnostics: [
        {
          code: 'missing-media-understanding-model',
          slot: 'primary',
          message: `No configured Agent model supports ${purpose}. Configure [default_model_purposes.${purposeToTomlKey(purpose)}] or enable a model with the ${purpose} capability.`,
        },
      ],
    };
  }

  return {
    status: 'resolved',
    purpose,
    model: {
      providerId: configured.providerId,
      modelId: configured.modelId,
      category: 'llm',
    },
  };
}

function projectFlatPurposeModels(
  input: ResolveAgentLlmConfigInput,
  understanding: MediaUnderstandingPrimaryResolution,
): { readonly purposeModels?: AgentFlatPurposeModelRefs } {
  const projected: AgentFlatPurposeModelRefs = {
    ...(input.mediaModels?.image ? { 'image.generate': input.mediaModels.image } : {}),
    ...(input.mediaModels?.video ? { 'video.generate': input.mediaModels.video } : {}),
    ...(input.mediaModels?.audio ? { 'audio.generate': input.mediaModels.audio } : {}),
    ...input.purposeModels,
    ...(understanding.status === 'resolved'
      ? { [understanding.purpose]: understanding.model }
      : {}),
  };
  return Object.keys(projected).length === 0 ? {} : { purposeModels: projected };
}

function getRequestedMediaUnderstandingPurposes(
  attachments: readonly MessageAttachment[] | undefined,
): readonly MediaUnderstandingPurpose[] {
  const purposes = new Set<MediaUnderstandingPurpose>();
  for (const attachment of attachments ?? []) {
    if (attachment.type === 'image') {
      purposes.add('image.understand');
    } else if (attachment.type === 'audio') {
      purposes.add('audio.understand');
    } else if (attachment.type === 'video') {
      purposes.add('video.understand');
    }
  }
  return [...purposes];
}

function purposeToTomlKey(purpose: MediaUnderstandingPurpose): string {
  return purpose.split('.').join('_');
}

function purposeToCategory(
  purpose: MediaUnderstandingPurpose,
): keyof MediaUnderstandingModelSelections {
  if (purpose === 'image.understand') return 'image';
  if (purpose === 'audio.understand') return 'audio';
  return 'video';
}

export function formatAgentLlmConfigDiagnostics(
  diagnostics: readonly AgentLlmConfigDiagnostic[],
): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join('\n');
}

function validateUnsupportedSlots(
  agentModels: AgentModelSlots | undefined,
): AgentLlmConfigDiagnostic[] {
  if (!agentModels) return [];
  return (Object.keys(agentModels) as AgentModelSlot[])
    .filter((slot) => !MVP_AGENT_MODEL_SLOTS.has(slot))
    .map((slot) => ({
      code: 'unsupported-agent-model-slot' as const,
      slot,
      message: `Agent model slot "${slot}" is defined, but this Agent runtime currently supports only the primary slot.`,
    }));
}

function resolveDefaultPrimaryModel(
  input: ResolveAgentLlmConfigInput,
): ModelRef<'llm'> | undefined {
  const selectedProviderId = input.settings.selectedProviderId ?? undefined;
  const selectedModelId = input.settings.selectedModelId ?? undefined;
  if (selectedProviderId && selectedModelId) {
    return { providerId: selectedProviderId, modelId: selectedModelId, category: 'llm' };
  }

  return undefined;
}

function resolveMissingPrimaryModelDiagnostic(
  input: ResolveAgentLlmConfigInput,
): AgentLlmConfigDiagnostic {
  const selectedProviderId = input.settings.selectedProviderId ?? undefined;
  const selectedModelId = input.settings.selectedModelId ?? undefined;
  if (selectedProviderId || selectedModelId) {
    return {
      code: 'incomplete-primary-model',
      slot: 'primary',
      message:
        'Agent primary model selection is incomplete. Choose a configured LLM provider and model before sending this Agent message.',
    };
  }

  return {
    code: 'missing-primary-model',
    slot: 'primary',
    message:
      'No Agent primary model is selected. Choose a configured LLM model before sending this Agent message.',
  };
}

function validatePrimaryModel(
  input: ResolveAgentLlmConfigInput,
  modelRef: ModelRef<'llm'>,
): AgentLlmConfigDiagnostic[] {
  const diagnostics: AgentLlmConfigDiagnostic[] = [];
  const provider = input.providers.getProvider(modelRef.providerId);
  if (!provider) {
    diagnostics.push({
      code: 'missing-primary-provider',
      slot: 'primary',
      message: `Agent primary provider "${modelRef.providerId}" is not registered.`,
    });
    return diagnostics;
  }

  if (!provider.isConfigured) {
    diagnostics.push({
      code: 'primary-provider-not-configured',
      slot: 'primary',
      message: `Agent primary provider "${modelRef.providerId}" is disabled or not configured.`,
    });
  }

  if (provider.modelIds && !provider.modelIds.includes(modelRef.modelId)) {
    diagnostics.push({
      code: 'primary-model-not-found',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" is not available from provider "${modelRef.providerId}".`,
    });
  }

  const model = input.providers.getModel(modelRef.modelId);
  if (!model) {
    diagnostics.push({
      code: 'primary-model-not-found',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" is not registered.`,
    });
    return diagnostics;
  }

  if (model.providerId !== modelRef.providerId) {
    diagnostics.push({
      code: 'primary-model-provider-mismatch',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" belongs to provider "${model.providerId}", not "${modelRef.providerId}".`,
    });
  }

  if (model.enabled === false || (model.type !== undefined && model.type !== 'llm')) {
    diagnostics.push({
      code: 'primary-model-not-llm',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" is not an enabled LLM model.`,
    });
  }

  return diagnostics;
}

function projectResolvedLlmRuntimeOptions(
  input: ResolveAgentLlmConfigInput,
  modelRef: ModelRef<'llm'>,
): {
  readonly runtimeOptions?: AgentLlmRuntimeOptions;
  readonly blockingDiagnostics: readonly AgentLlmConfigDiagnostic[];
} {
  if (!input.platform) {
    return { blockingDiagnostics: [] };
  }

  const provider = input.providers.getProviderConfig(modelRef.providerId);
  const model = input.providers.getModel(modelRef.modelId);
  if (!provider || !model) {
    return { blockingDiagnostics: [] };
  }

  const projection = projectLlmParameters({
    provider,
    model,
    llmConfig: input.llmConfig,
    runtimeDefaults: {
      temperature: input.settings.temperature,
      maxOutputTokens: input.settings.maxTokens,
      thinkingBudget: input.settings.thinkingBudget,
    },
  });
  const blockingDiagnostics = projection.diagnostics
    .filter(isBlockingLlmParameterDiagnostic)
    .map(mapLlmParameterDiagnostic);
  const runtimeOptions = removeUndefinedValues({
    projected: true,
    temperature: projection.chatOptions.temperature,
    topP: projection.chatOptions.topP,
    maxTokens: projection.chatOptions.maxTokens,
    thinkingBudget: projection.chatOptions.thinkingBudget,
    providerOptions:
      Object.keys(projection.providerOptions).length > 0 ? projection.providerOptions : undefined,
  });

  return {
    ...(Object.keys(runtimeOptions).length > 0 ? { runtimeOptions } : {}),
    blockingDiagnostics,
  };
}

function isBlockingLlmParameterDiagnostic(diagnostic: LlmParameterDiagnostic): boolean {
  return diagnostic.code === 'invalid-anthropic-thinking-sampling-combination';
}

function mapLlmParameterDiagnostic(diagnostic: LlmParameterDiagnostic): AgentLlmConfigDiagnostic {
  return {
    code:
      diagnostic.code === 'invalid-anthropic-thinking-sampling-combination'
        ? 'incompatible-llm-parameter'
        : 'unsupported-llm-parameter',
    field: diagnostic.field,
    message: diagnostic.message,
  };
}

function sameModelRef(a: ModelRef<'llm'>, b: ModelRef<'llm'>): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId && a.category === b.category;
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

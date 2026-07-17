import type { AgentLlmConfig } from '@neko-agent/types';
import type { GenCategory, GenerationParams } from '@/components/ChatView/InputArea/types';
import type {
  MediaModelSelection,
  MediaUnderstandingSelection,
} from '@/components/ChatView/InputAreaContext';
import type {
  TabRenderBinding,
  TabRenderRuntimeRegistry,
  TabRenderState,
  TabRenderStateUpdate,
} from './tab-render-runtime';

export const TAB_RENDER_REALM_STATE_VERSION = 'neko.agent.tab-render-realm-state.v1' as const;
const LEGACY_TIMELINE_RECOVERY_STATE_KEY = 'agentTurnTimelineRecoveries';

export interface TabRenderDraftSnapshot extends TabRenderBinding {
  readonly inputValue: string;
  readonly selectedModel: string;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly mediaUnderstandingSelection: Readonly<MediaUnderstandingSelection>;
  readonly sessionMode: TabRenderState['sessionMode'];
  readonly executionMode: TabRenderState['executionMode'];
  readonly generationCategory: GenCategory;
  readonly generationParams: Readonly<GenerationParams>;
  readonly llmConfig: Readonly<AgentLlmConfig>;
}

export interface TabRenderRealmState {
  readonly schemaVersion: typeof TAB_RENDER_REALM_STATE_VERSION;
  readonly drafts: readonly TabRenderDraftSnapshot[];
}

export interface TabRenderRealmStateCoordinator {
  reconcile(bindings: readonly TabRenderBinding[]): boolean;
  flush(): void;
  dispose(): void;
}

export interface TabRenderRealmStateHost {
  getState(): unknown;
  setState(state: TabRenderRealmState): void;
}

export function createTabRenderRealmStateCoordinator(
  host: TabRenderRealmStateHost,
  registry: TabRenderRuntimeRegistry,
): TabRenderRealmStateCoordinator {
  return new DefaultTabRenderRealmStateCoordinator(host, registry);
}

export function parseTabRenderRealmState(value: unknown): TabRenderRealmState {
  if (value === undefined) return { schemaVersion: TAB_RENDER_REALM_STATE_VERSION, drafts: [] };
  if (isLegacyTimelineRecoveryState(value)) {
    return { schemaVersion: TAB_RENDER_REALM_STATE_VERSION, drafts: [] };
  }
  if (!isRecord(value) || value.schemaVersion !== TAB_RENDER_REALM_STATE_VERSION) {
    throw new Error('Unsupported Agent Tab render realm state schema.');
  }
  if (!Array.isArray(value.drafts)) {
    throw new Error('Agent Tab render realm state drafts must be an array.');
  }
  const drafts = value.drafts.map((draft, index) => parseDraft(draft, index));
  const tabIds = new Set<string>();
  for (const draft of drafts) {
    if (tabIds.has(draft.tabId)) {
      throw new Error(`Duplicate persisted Agent Tab draft for ${draft.tabId}.`);
    }
    tabIds.add(draft.tabId);
  }
  return { schemaVersion: TAB_RENDER_REALM_STATE_VERSION, drafts };
}

class DefaultTabRenderRealmStateCoordinator implements TabRenderRealmStateCoordinator {
  private readonly drafts = new Map<string, TabRenderDraftSnapshot>();
  private readonly subscriptions = new Map<string, () => void>();
  private readonly restoredTabIds = new Set<string>();
  private readonly knownBindings = new Map<string, string>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(
    private readonly host: TabRenderRealmStateHost,
    private readonly registry: TabRenderRuntimeRegistry,
  ) {
    const persistedState = host.getState();
    const state = parseTabRenderRealmState(persistedState);
    if (isLegacyTimelineRecoveryState(persistedState)) {
      host.setState(state);
    }
    for (const draft of state.drafts) {
      this.drafts.set(draft.tabId, draft);
    }
  }

  reconcile(bindings: readonly TabRenderBinding[]): boolean {
    this.assertActive();
    let changed = false;
    const nextBindings = new Map<string, string>();
    for (const binding of bindings) {
      if (nextBindings.has(binding.tabId)) {
        throw new Error(`Duplicate Tab draft binding for ${binding.tabId}.`);
      }
      nextBindings.set(binding.tabId, binding.conversationId);
      const persisted = this.drafts.get(binding.tabId);
      if (persisted && persisted.conversationId !== binding.conversationId) {
        throw new Error(
          `Persisted Tab draft ${binding.tabId} belongs to ${persisted.conversationId}, not ${binding.conversationId}.`,
        );
      }
      const runtime = this.registry.require(binding.tabId);
      if (!this.restoredTabIds.has(binding.tabId)) {
        if (persisted) {
          runtime.store.updateState(toStateUpdate(persisted));
          changed = true;
        }
        this.restoredTabIds.add(binding.tabId);
      }
      if (!this.subscriptions.has(binding.tabId)) {
        this.subscriptions.set(
          binding.tabId,
          runtime.store.subscribe(() => {
            const nextDraft = projectDraft(runtime.store.getSnapshot().state, binding);
            const previousDraft = this.drafts.get(binding.tabId);
            if (previousDraft && hasSameDraft(previousDraft, nextDraft)) return;
            this.drafts.set(binding.tabId, nextDraft);
            this.scheduleFlush();
          }),
        );
      }
    }

    for (const [tabId] of this.knownBindings) {
      if (nextBindings.has(tabId)) continue;
      this.subscriptions.get(tabId)?.();
      this.subscriptions.delete(tabId);
      this.restoredTabIds.delete(tabId);
      this.drafts.delete(tabId);
      this.scheduleFlush();
      changed = true;
    }
    this.knownBindings.clear();
    for (const [tabId, conversationId] of nextBindings) {
      this.knownBindings.set(tabId, conversationId);
    }
    return changed;
  }

  flush(): void {
    this.assertActive();
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.host.setState({
      schemaVersion: TAB_RENDER_REALM_STATE_VERSION,
      drafts: [...this.drafts.values()],
    });
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.flushTimer !== undefined) this.flush();
    this.disposed = true;
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) return;
    this.flushTimer = setTimeout(() => this.flush(), 100);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Agent Tab render realm state coordinator is disposed.');
  }
}

function projectDraft(state: TabRenderState, binding: TabRenderBinding): TabRenderDraftSnapshot {
  return {
    ...binding,
    inputValue: state.inputValue,
    selectedModel: state.selectedModel,
    mediaModelSelection: { ...state.mediaModelSelection },
    mediaUnderstandingSelection: { ...state.mediaUnderstandingSelection },
    sessionMode: state.sessionMode,
    executionMode: state.executionMode,
    generationCategory: state.generationCategory,
    generationParams: { ...state.generationParams },
    llmConfig: {
      ...state.llmConfig,
      ...(state.llmConfig.advanced ? { advanced: { ...state.llmConfig.advanced } } : {}),
    },
  };
}

function toStateUpdate(draft: TabRenderDraftSnapshot): TabRenderStateUpdate {
  return {
    inputValue: draft.inputValue,
    selectedModel: draft.selectedModel,
    mediaModelSelection: draft.mediaModelSelection,
    mediaUnderstandingSelection: draft.mediaUnderstandingSelection,
    sessionMode: draft.sessionMode,
    executionMode: draft.executionMode,
    generationCategory: draft.generationCategory,
    generationParams: draft.generationParams,
    llmConfig: draft.llmConfig,
  };
}

function hasSameDraft(left: TabRenderDraftSnapshot, right: TabRenderDraftSnapshot): boolean {
  return (
    left.tabId === right.tabId &&
    left.conversationId === right.conversationId &&
    left.inputValue === right.inputValue &&
    left.selectedModel === right.selectedModel &&
    left.mediaModelSelection.image === right.mediaModelSelection.image &&
    left.mediaModelSelection.video === right.mediaModelSelection.video &&
    left.mediaModelSelection.audio === right.mediaModelSelection.audio &&
    left.mediaUnderstandingSelection.image === right.mediaUnderstandingSelection.image &&
    left.mediaUnderstandingSelection.video === right.mediaUnderstandingSelection.video &&
    left.mediaUnderstandingSelection.audio === right.mediaUnderstandingSelection.audio &&
    left.sessionMode === right.sessionMode &&
    left.executionMode === right.executionMode &&
    left.generationCategory === right.generationCategory &&
    left.generationParams.ratio === right.generationParams.ratio &&
    left.generationParams.resolution === right.generationParams.resolution &&
    left.generationParams.videoDuration === right.generationParams.videoDuration &&
    left.generationParams.videoFps === right.generationParams.videoFps &&
    left.generationParams.audioDuration === right.generationParams.audioDuration &&
    left.generationParams.audioType === right.generationParams.audioType &&
    left.llmConfig.reasoningPreset === right.llmConfig.reasoningPreset &&
    left.llmConfig.verbosityPreset === right.llmConfig.verbosityPreset &&
    left.llmConfig.creativityPreset === right.llmConfig.creativityPreset &&
    left.llmConfig.advanced?.temperature === right.llmConfig.advanced?.temperature &&
    left.llmConfig.advanced?.topP === right.llmConfig.advanced?.topP &&
    left.llmConfig.advanced?.maxOutputTokens === right.llmConfig.advanced?.maxOutputTokens &&
    left.llmConfig.advanced?.reasoningEffort === right.llmConfig.advanced?.reasoningEffort &&
    left.llmConfig.advanced?.thinkingBudget === right.llmConfig.advanced?.thinkingBudget &&
    left.llmConfig.advanced?.verbosity === right.llmConfig.advanced?.verbosity &&
    left.llmConfig.advanced?.serviceTier === right.llmConfig.advanced?.serviceTier
  );
}

function parseDraft(value: unknown, index: number): TabRenderDraftSnapshot {
  const path = `Agent Tab draft ${index}`;
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  const tabId = nonEmptyString(value.tabId, `${path}.tabId`);
  const conversationId = nonEmptyString(value.conversationId, `${path}.conversationId`);
  const inputValue = stringValue(value.inputValue, `${path}.inputValue`);
  const selectedModel = stringValue(value.selectedModel, `${path}.selectedModel`);
  return {
    tabId,
    conversationId,
    inputValue,
    selectedModel,
    mediaModelSelection: parseMediaSelection(
      value.mediaModelSelection,
      `${path}.mediaModelSelection`,
    ),
    mediaUnderstandingSelection: parseMediaSelection(
      value.mediaUnderstandingSelection,
      `${path}.mediaUnderstandingSelection`,
    ),
    sessionMode: enumValue(
      value.sessionMode,
      ['agent', 'image', 'video', 'audio'],
      `${path}.sessionMode`,
    ),
    executionMode: enumValue(value.executionMode, ['plan', 'ask', 'auto'], `${path}.executionMode`),
    generationCategory: enumValue(
      value.generationCategory,
      ['image', 'video', 'audio'],
      `${path}.generationCategory`,
    ),
    generationParams: parseGenerationParams(value.generationParams, `${path}.generationParams`),
    llmConfig: parseLlmConfig(value.llmConfig, `${path}.llmConfig`),
  };
}

function parseMediaSelection(value: unknown, path: string): MediaModelSelection {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return {
    image: stringValue(value.image, `${path}.image`),
    video: stringValue(value.video, `${path}.video`),
    audio: stringValue(value.audio, `${path}.audio`),
  };
}

function parseGenerationParams(value: unknown, path: string): GenerationParams {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return {
    ratio: enumValue(
      value.ratio,
      ['16:9', '9:16', '1:1', '4:3', '3:2', '21:9', '2.39:1'],
      `${path}.ratio`,
    ),
    resolution: enumValue(
      value.resolution,
      ['512', '720p', '1080p', '2K', '4K'],
      `${path}.resolution`,
    ),
    videoDuration: durationValue(value.videoDuration, `${path}.videoDuration`),
    videoFps: enumValue(value.videoFps, [24, 30], `${path}.videoFps`),
    audioDuration: durationValue(value.audioDuration, `${path}.audioDuration`),
    audioType: enumValue(value.audioType, ['sfx', 'ambient', 'voice'], `${path}.audioType`),
  };
}

function parseLlmConfig(value: unknown, path: string): AgentLlmConfig {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return {
    ...(value.reasoningPreset !== undefined
      ? {
          reasoningPreset: enumValue(
            value.reasoningPreset,
            ['fast', 'balanced', 'deep'],
            `${path}.reasoningPreset`,
          ),
        }
      : {}),
    ...(value.verbosityPreset !== undefined
      ? {
          verbosityPreset: enumValue(
            value.verbosityPreset,
            ['brief', 'standard', 'detailed'],
            `${path}.verbosityPreset`,
          ),
        }
      : {}),
    ...(value.creativityPreset !== undefined
      ? {
          creativityPreset: enumValue(
            value.creativityPreset,
            ['stable', 'creative', 'wild'],
            `${path}.creativityPreset`,
          ),
        }
      : {}),
    ...(value.advanced !== undefined
      ? { advanced: parseAdvanced(value.advanced, `${path}.advanced`) }
      : {}),
  };
}

function parseAdvanced(value: unknown, path: string): NonNullable<AgentLlmConfig['advanced']> {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return {
    ...optionalNumber(value, 'temperature', path),
    ...optionalNumber(value, 'topP', path),
    ...optionalNumber(value, 'maxOutputTokens', path),
    ...optionalNumber(value, 'thinkingBudget', path),
    ...(value.reasoningEffort !== undefined
      ? {
          reasoningEffort: enumValue(
            value.reasoningEffort,
            ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
            `${path}.reasoningEffort`,
          ),
        }
      : {}),
    ...(value.verbosity !== undefined
      ? { verbosity: enumValue(value.verbosity, ['low', 'medium', 'high'], `${path}.verbosity`) }
      : {}),
    ...(value.serviceTier !== undefined
      ? {
          serviceTier: enumValue(
            value.serviceTier,
            ['auto', 'default', 'fast', 'flex', 'priority'],
            `${path}.serviceTier`,
          ),
        }
      : {}),
  };
}

function optionalNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
): Record<string, number> {
  const candidate = value[key];
  if (candidate === undefined) return {};
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`${path}.${key} must be a finite number.`);
  }
  return { [key]: candidate };
}

function durationValue(value: unknown, path: string): 'auto' | number {
  if (value === 'auto') return value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be 'auto' or a positive number.`);
  }
  return value;
}

function enumValue<const T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  for (const candidate of allowed) {
    if (value === candidate) return candidate;
  }
  throw new Error(`${path} has an unsupported value.`);
}

function nonEmptyString(value: unknown, path: string): string {
  const result = stringValue(value, path);
  if (result.trim().length === 0) throw new Error(`${path} must be non-empty.`);
  return result;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLegacyTimelineRecoveryState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === LEGACY_TIMELINE_RECOVERY_STATE_KEY &&
    Array.isArray(value[LEGACY_TIMELINE_RECOVERY_STATE_KEY]) &&
    value[LEGACY_TIMELINE_RECOVERY_STATE_KEY].every(isLegacyTimelineRecoveryDescriptor)
  );
}

function isLegacyTimelineRecoveryDescriptor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 5 &&
    keys.includes('connectionEpoch') &&
    keys.includes('conversationId') &&
    keys.includes('turnId') &&
    keys.includes('messageId') &&
    keys.includes('lastAppliedDeliveryRevision') &&
    isNonEmptyString(value.connectionEpoch) &&
    isNonEmptyString(value.conversationId) &&
    isNonEmptyString(value.turnId) &&
    isNonEmptyString(value.messageId) &&
    typeof value.lastAppliedDeliveryRevision === 'number' &&
    Number.isInteger(value.lastAppliedDeliveryRevision) &&
    value.lastAppliedDeliveryRevision > 0
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

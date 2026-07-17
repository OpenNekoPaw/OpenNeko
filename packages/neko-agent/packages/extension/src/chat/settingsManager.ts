/**
 * Conversation-scoped Agent settings.
 *
 * ConfigManager remains the authority for validated global defaults. Runtime UI
 * mutations are stored per conversation and only affect future turns.
 */

import {
  buildAssistantRuntimeSettingsSnapshot,
  mapWebviewSettingsToUnifiedScalars,
  type AssistantRuntimeSettingsSnapshot,
  type ConfigManager,
} from '@neko/platform';

const CONVERSATION_SETTINGS_STORAGE_PREFIX = 'neko.agent.conversationSettings.v1.';

const PERSISTED_SETTINGS_KEYS = new Set([
  'selectedProviderId',
  'selectedModelId',
  'customSystemPrompt',
  'autoExecuteTools',
  'streamResponses',
  'showToolCalls',
  'temperature',
  'maxTokens',
  'thinkingBudget',
  'executionMode',
]);

const SUPPORTED_CONVERSATION_SETTING_KEYS = new Set([
  'providerId',
  'modelId',
  'systemPrompt',
  'autoExecuteTools',
  'streamResponses',
  'showToolCalls',
  'temperature',
  'maxTokens',
  'executionMode',
  'thinkingBudget',
]);

export interface ConversationSettingsStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

interface PersistedConversationSettings {
  readonly version: 1;
  readonly conversationId: string;
  readonly settings: AssistantRuntimeSettingsSnapshot;
}

export class SettingsManager {
  private _configManager: ConfigManager | null;
  private readonly conversationSettings = new Map<string, AssistantRuntimeSettingsSnapshot>();

  constructor(
    configManager?: ConfigManager,
    private readonly storage?: ConversationSettingsStorage,
  ) {
    this._configManager = configManager ?? null;
  }

  setConfigManager(configManager: ConfigManager): void {
    this._configManager = configManager;
  }

  snapshotForConversation(conversationId: string): AssistantRuntimeSettingsSnapshot {
    assertConversationId(conversationId);
    const existing = this.conversationSettings.get(conversationId);
    if (existing) return existing;

    const restored = this.restoreConversation(conversationId);
    const initialized = restored ?? freezeSnapshot(this.readValidatedDefaults());
    this.conversationSettings.set(conversationId, initialized);
    return initialized;
  }

  async updateConversation(
    conversationId: string,
    settings: Record<string, unknown>,
  ): Promise<AssistantRuntimeSettingsSnapshot> {
    assertConversationId(conversationId);
    validateConversationSettingsUpdate(settings);
    const current = this.snapshotForConversation(conversationId);
    const mapped = mapWebviewSettingsToUnifiedScalars(settings);
    const next = freezeSnapshot({
      ...current,
      ...('defaultProvider' in mapped
        ? { selectedProviderId: mapped.defaultProvider ?? null }
        : {}),
      ...('defaultModel' in mapped ? { selectedModelId: mapped.defaultModel ?? null } : {}),
      ...(mapped.customSystemPrompt !== undefined
        ? { customSystemPrompt: mapped.customSystemPrompt }
        : {}),
      ...(mapped.autoExecuteTools !== undefined
        ? { autoExecuteTools: mapped.autoExecuteTools }
        : {}),
      ...(mapped.streamResponses !== undefined ? { streamResponses: mapped.streamResponses } : {}),
      ...(mapped.showToolCalls !== undefined ? { showToolCalls: mapped.showToolCalls } : {}),
      ...(mapped.temperature !== undefined ? { temperature: mapped.temperature } : {}),
      ...(mapped.maxTokens !== undefined ? { maxTokens: mapped.maxTokens } : {}),
      ...(mapped.executionMode !== undefined ? { executionMode: mapped.executionMode } : {}),
      ...(mapped.thinkingBudget !== undefined ? { thinkingBudget: mapped.thinkingBudget } : {}),
    });
    await this.persistConversation(conversationId, next);
    this.conversationSettings.set(conversationId, next);
    return next;
  }

  async clearConversation(conversationId: string): Promise<void> {
    assertConversationId(conversationId);
    await this.storage?.update(storageKey(conversationId), undefined);
    this.conversationSettings.delete(conversationId);
  }

  private restoreConversation(conversationId: string): AssistantRuntimeSettingsSnapshot | null {
    const raw = this.storage?.get<unknown>(storageKey(conversationId));
    if (raw === undefined) return null;
    return parsePersistedConversationSettings(raw, conversationId);
  }

  private async persistConversation(
    conversationId: string,
    settings: AssistantRuntimeSettingsSnapshot,
  ): Promise<void> {
    if (!this.storage) return;
    const record: PersistedConversationSettings = {
      version: 1,
      conversationId,
      settings,
    };
    await this.storage.update(storageKey(conversationId), record);
  }

  private readValidatedDefaults(): AssistantRuntimeSettingsSnapshot {
    const base =
      this._configManager?.getAssistantRuntimeSettingsSnapshot() ??
      buildAssistantRuntimeSettingsSnapshot({
        defaultProvider: null,
        defaultModel: null,
      });
    const effective = this._configManager?.getEffectiveAgentWorkspaceConfigSnapshot();
    return effective
      ? {
          ...base,
          selectedProviderId: effective.providerId,
          selectedModelId: effective.modelId,
          temperature: effective.temperature,
          maxTokens: effective.maxTokens,
          thinkingBudget: effective.thinkingBudget,
          executionMode: effective.executionMode,
        }
      : base;
  }
}

function storageKey(conversationId: string): string {
  return `${CONVERSATION_SETTINGS_STORAGE_PREFIX}${conversationId}`;
}

function parsePersistedConversationSettings(
  raw: unknown,
  expectedConversationId: string,
): AssistantRuntimeSettingsSnapshot {
  if (!isRecord(raw) || raw.version !== 1) {
    throw new Error(`Invalid persisted conversation settings for ${expectedConversationId}.`);
  }
  if (raw.conversationId !== expectedConversationId) {
    throw new Error(
      `Persisted conversation settings ownership mismatch: expected ${expectedConversationId}.`,
    );
  }
  if (!isRecord(raw.settings)) {
    throw new Error(`Persisted conversation settings are missing for ${expectedConversationId}.`);
  }
  const settings = raw.settings;
  const unknownKeys = Object.keys(settings).filter((key) => !PERSISTED_SETTINGS_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Unsupported persisted conversation settings fields for ${expectedConversationId}: ${unknownKeys.join(', ')}.`,
    );
  }
  const selectedProviderId = readNullableString(settings, 'selectedProviderId');
  const selectedModelId = readNullableString(settings, 'selectedModelId');
  const customSystemPrompt = readRequiredString(settings, 'customSystemPrompt');
  const autoExecuteTools = readRequiredBoolean(settings, 'autoExecuteTools');
  const streamResponses = readRequiredBoolean(settings, 'streamResponses');
  const showToolCalls = readRequiredBoolean(settings, 'showToolCalls');
  const temperature = readRequiredFiniteNumber(settings, 'temperature');
  const maxTokens = readRequiredFiniteNumber(settings, 'maxTokens');
  const thinkingBudget = readRequiredFiniteNumber(settings, 'thinkingBudget');
  const executionMode = settings.executionMode;
  if (executionMode !== 'plan' && executionMode !== 'ask' && executionMode !== 'auto') {
    throw new Error(`Invalid persisted executionMode for ${expectedConversationId}.`);
  }
  return freezeSnapshot({
    selectedProviderId,
    selectedModelId,
    customSystemPrompt,
    autoExecuteTools,
    streamResponses,
    showToolCalls,
    temperature,
    maxTokens,
    thinkingBudget,
    executionMode,
  });
}

function readNullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === null || typeof field === 'string') return field;
  throw new Error(`Invalid persisted ${key}.`);
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field === 'string') return field;
  throw new Error(`Invalid persisted ${key}.`);
}

function readRequiredBoolean(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field === 'boolean') return field;
  throw new Error(`Invalid persisted ${key}.`);
}

function readRequiredFiniteNumber(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field === 'number' && Number.isFinite(field)) return field;
  throw new Error(`Invalid persisted ${key}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateConversationSettingsUpdate(settings: Record<string, unknown>): void {
  const keys = Object.keys(settings);
  if (keys.length === 0) {
    throw new Error('Conversation settings update must contain at least one field.');
  }
  const unsupported = keys.filter((key) => !SUPPORTED_CONVERSATION_SETTING_KEYS.has(key));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported conversation settings fields: ${unsupported.join(', ')}.`);
  }

  validateNullableString(settings, 'providerId');
  validateNullableString(settings, 'modelId');
  validateOptionalType(settings, 'systemPrompt', 'string');
  validateOptionalType(settings, 'autoExecuteTools', 'boolean');
  validateOptionalType(settings, 'streamResponses', 'boolean');
  validateOptionalType(settings, 'showToolCalls', 'boolean');
  validateFiniteNumber(settings, 'temperature');
  validateFiniteNumber(settings, 'maxTokens');
  validateFiniteNumber(settings, 'thinkingBudget');
  if (
    'executionMode' in settings &&
    settings.executionMode !== 'plan' &&
    settings.executionMode !== 'ask' &&
    settings.executionMode !== 'auto'
  ) {
    throw new Error('executionMode must be plan, ask, or auto.');
  }
}

function validateNullableString(settings: Record<string, unknown>, key: string): void {
  if (key in settings && settings[key] !== null && typeof settings[key] !== 'string') {
    throw new Error(`${key} must be a string or null.`);
  }
}

function validateOptionalType(
  settings: Record<string, unknown>,
  key: string,
  expected: 'string' | 'boolean',
): void {
  if (key in settings && typeof settings[key] !== expected) {
    throw new Error(`${key} must be a ${expected}.`);
  }
}

function validateFiniteNumber(settings: Record<string, unknown>, key: string): void {
  if (key in settings && (typeof settings[key] !== 'number' || !Number.isFinite(settings[key]))) {
    throw new Error(`${key} must be a finite number.`);
  }
}

function assertConversationId(conversationId: string): void {
  if (conversationId.trim().length === 0) {
    throw new Error('conversationId is required for Agent settings.');
  }
}

function freezeSnapshot(
  snapshot: AssistantRuntimeSettingsSnapshot,
): AssistantRuntimeSettingsSnapshot {
  return Object.freeze({ ...snapshot });
}

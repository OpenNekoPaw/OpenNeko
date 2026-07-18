import {
  resolveAgentTokenBudget,
  type AgentContextPayload,
  type ChatModelOption,
  type ModelSourceGroup,
  type ModelType,
} from '@neko/shared';
import type {
  AgentMediaModelCategory,
  AgentMediaModelSelections,
  ChatWorkspaceModelStateInput,
  ChatWorkspaceModelStateProjection,
  ConfigStateMessage,
  MediaModelCategory,
  MediaModelDefaults,
  MediaModelSelectionDefaultsProjection,
  MediaModelSelectionState,
  MediaUnderstandingCategory,
  MediaUnderstandingModelSource,
  MediaUnderstandingModelStatus,
  MediaUnderstandingModelStatusValue,
  MediaUnderstandingModels,
  MediaUnderstandingPurpose,
  MessageModelProjection,
  MessageModelProjectionInput,
  ModelRef,
  PluginCommandsMessage,
  PluginSlashCommandProjection,
  PluginsAvailable,
  PluginsAvailableMessage,
  ProjectFileMentionInfo,
  ProjectFilesMessage,
  ProjectFilesProjection,
  ProjectMentionExtra,
  ProviderMutationResultMessage,
  SessionModeMediaSelectionProjection,
  SettingsDataMessage,
  SettingsDataProjection,
  SettingsState,
  SettingsUpdatedMessage,
} from '@neko-agent/types';

const AGENT_MEDIA_CATEGORIES: readonly AgentMediaModelCategory[] = ['image', 'video', 'audio'];
const MEDIA_UNDERSTANDING_PURPOSES = {
  image: 'image.understand',
  audio: 'audio.understand',
  video: 'video.understand',
} as const satisfies Record<MediaUnderstandingCategory, MediaUnderstandingPurpose>;

export function projectSettingsDataMessage(message: SettingsDataMessage): SettingsDataProjection {
  const source = asRecord(message) ?? {};
  const selectedProviderId = readString(source, 'selectedProviderId') ?? null;
  const selectedModelId = readString(source, 'selectedModelId') ?? null;
  const configDiagnostic = readConfigDiagnostic(source.configDiagnostic);
  const mediaUnderstandingModels = readMediaUnderstandingModels(source.mediaUnderstandingModels);

  return {
    settingsPatch: {
      providers: readProviderViews(source.providers),
      selectedProviderId,
      selectedModelId,
      systemPrompt: readString(source, 'systemPrompt') ?? '',
      autoExecuteTools: readBoolean(source, 'autoExecuteTools') ?? true,
      streamResponses: readBoolean(source, 'streamResponses') ?? true,
      showToolCalls: readBoolean(source, 'showToolCalls') ?? true,
      temperature: readNumber(source, 'temperature') ?? 0.7,
      maxTokens: readNumber(source, 'maxTokens') ?? 4096,
      executionMode: readShellExecutionMode(source.executionMode) ?? 'ask',
      chatModelOptions: readChatModelOptions(source.chatModelOptions),
      ...(Array.isArray(source.modelGroups)
        ? { modelGroups: readModelSourceGroups(source.modelGroups) }
        : {}),
      ...(mediaUnderstandingModels ? { mediaUnderstandingModels } : {}),
      configDiagnostic,
    },
    selectedModel:
      selectedProviderId && selectedModelId ? `${selectedProviderId}:${selectedModelId}` : null,
    defaultMediaModels: readMediaModelDefaults(source.defaultMediaModels),
    ...(configDiagnostic ? { configDiagnostic } : {}),
  };
}

export function projectMediaModelSelectionDefaults(input: {
  selection: Readonly<MediaModelSelectionState>;
  defaults: MediaModelDefaults;
}): MediaModelSelectionDefaultsProjection {
  let updated = false;
  const selection: MediaModelSelectionState = {
    image: input.selection.image,
    video: input.selection.video,
    audio: input.selection.audio,
  };

  for (const category of AGENT_MEDIA_CATEGORIES) {
    const defaultModel = input.defaults[category];
    if (selection[category] === 'none' && defaultModel) {
      selection[category] = defaultModel;
      updated = true;
    }
  }

  return { selection, updated };
}

export function projectMessageModelSelection(
  input: MessageModelProjectionInput,
): MessageModelProjection {
  const chatModel = projectSelectedChatModel(input.selectedModel, input.chatModelOptions);
  const mediaModel = projectDirectMediaModel({
    sessionMode: input.sessionMode,
    providerId: input.mediaProviderId,
    modelId: input.mediaModelId,
  });

  return {
    ...(chatModel ? { chatModel } : {}),
    ...(mediaModel ? { mediaModel } : {}),
    ...(input.agentMediaModels
      ? { purposeModels: projectAgentGenerationPurposeModels(input.agentMediaModels) }
      : {}),
  };
}

function projectAgentGenerationPurposeModels(
  selections: AgentMediaModelSelections,
): NonNullable<MessageModelProjection['purposeModels']> {
  return {
    ...(selections.image ? { 'image.generate': selections.image } : {}),
    ...(selections.video ? { 'video.generate': selections.video } : {}),
    ...(selections.audio ? { 'audio.generate': selections.audio } : {}),
  };
}

export function projectChatWorkspaceModelState(
  input: ChatWorkspaceModelStateInput,
): ChatWorkspaceModelStateProjection {
  const allModels = normalizeChatModelOptions(input.chatModelOptions);
  const availableModels = allModels.filter(isChatSelectableModel);
  const availableMediaModels = allModels.filter(isAgentMediaChatModelOption);
  const selectedModelOption = availableModels.find((model) => model.id === input.selectedModel);
  const selectedTokenBudget = resolveAgentTokenBudget({
    modelId: selectedModelOption?.modelId ?? input.selectedModel,
    contextWindow: selectedModelOption?.contextWindow,
    modelMaxOutputTokens: selectedModelOption?.maxOutputTokens,
    defaultMaxOutputTokens: input.defaultMaxOutputTokens,
  });
  let activeMediaModel: ChatModelOption | undefined;
  let agentMediaModels: AgentMediaModelSelections | undefined;

  if (input.sessionMode === 'agent') {
    agentMediaModels = projectAgentMediaModelSelections(
      input.mediaModelSelection,
      availableMediaModels,
    );
  } else {
    const sessionMode = input.sessionMode;
    activeMediaModel = availableMediaModels.find(
      (model) => model.id === input.mediaModelSelection[sessionMode],
    );
  }

  return {
    allModels,
    availableModels,
    availableMediaModels,
    ...(selectedTokenBudget.contextWindow !== undefined
      ? { selectedContextWindow: selectedTokenBudget.contextWindow }
      : {}),
    ...(selectedTokenBudget.effectiveInputBudget !== undefined
      ? { selectedEffectiveInputBudget: selectedTokenBudget.effectiveInputBudget }
      : {}),
    ...(selectedTokenBudget.effectiveMaxOutputTokens !== undefined
      ? { selectedOutputTokenCap: selectedTokenBudget.effectiveMaxOutputTokens }
      : {}),
    ...(selectedTokenBudget.modelMaxOutputTokens !== undefined
      ? { selectedMaxOutputTokens: selectedTokenBudget.modelMaxOutputTokens }
      : {}),
    ...(activeMediaModel ? { activeMediaModel } : {}),
    ...(agentMediaModels ? { agentMediaModels } : {}),
  };
}

export function projectMediaModelSelectionForSessionModeChange(input: {
  sessionMode: MessageModelProjectionInput['sessionMode'];
  mediaModelSelection: Readonly<MediaModelSelectionState>;
  chatModelOptions: readonly ChatModelOption[];
}): SessionModeMediaSelectionProjection {
  const mediaModelSelection: MediaModelSelectionState = {
    image: input.mediaModelSelection.image,
    video: input.mediaModelSelection.video,
    audio: input.mediaModelSelection.audio,
  };

  if (input.sessionMode === 'agent') {
    return {
      sessionMode: input.sessionMode,
      mediaModelSelection,
      updated: false,
    };
  }

  const allModels = normalizeChatModelOptions(input.chatModelOptions);
  const firstModel = allModels.find((model) => model.category === input.sessionMode);
  if (!firstModel || mediaModelSelection[input.sessionMode] === firstModel.id) {
    return {
      sessionMode: input.sessionMode,
      mediaModelSelection,
      updated: false,
    };
  }

  mediaModelSelection[input.sessionMode] = firstModel.id;
  return {
    sessionMode: input.sessionMode,
    mediaModelSelection,
    updated: true,
  };
}

export function projectProjectFilesMessage(message: ProjectFilesMessage): ProjectFilesProjection {
  const projectFiles = (message.files ?? []).filter(isProjectFileMentionInfo);
  const fileMentions = projectFiles.map((file) => ({
    id: `file:${file.path}`,
    kind: 'file' as const,
    label: file.name,
    description: file.path,
    filePath: file.path,
    ...(file.icon ? { icon: file.icon } : {}),
    ...(file.source ? { source: file.source } : {}),
    ...(file.mediaType ? { mediaType: file.mediaType } : {}),
  }));

  const extraMentions = (message.mentionExtras ?? [])
    .filter(isProjectMentionExtra)
    .map((extra) => ({
      id: `${extra.type}:${extra.id}`,
      kind: extra.type,
      label: extra.label,
      description: describeMentionExtra(extra),
      contextPayload: toAgentContextPayload(extra),
      ...(extra.icon ? { icon: extra.icon } : {}),
      ...(extra.source ? { source: extra.source } : {}),
      ...(extra.filePath ? { filePath: extra.filePath } : {}),
      ...(extra.mediaType ? { mediaType: extra.mediaType } : {}),
      ...(extra.entityType ? { entityType: extra.entityType } : {}),
      ...(extra.navigationData ? { navigationData: extra.navigationData } : {}),
      ...(extra.thumbnailUri ? { thumbnailUri: extra.thumbnailUri } : {}),
      searchText: [
        extra.label,
        extra.summary,
        extra.searchText,
        extra.filePath,
        extra.mediaType,
        extra.entityType,
        ...(extra.navigationData ? Object.values(extra.navigationData) : []),
      ]
        .filter(Boolean)
        .join(' '),
    }));

  return {
    projectFiles,
    mentionItems: [...fileMentions, ...extraMentions],
  };
}

export function projectConfigStateMessage(
  message: ConfigStateMessage,
): Partial<SettingsState> | null {
  if (!message.config) return null;
  const config = asRecord(message.config);
  if (!config) return null;
  const mediaUnderstandingModels = readMediaUnderstandingModels(
    message.config.mediaUnderstandingModels,
  );
  const customSystemPrompt = readString(config, 'customSystemPrompt');
  const autoExecuteTools = readBoolean(config, 'autoExecuteTools');
  const streamResponses = readBoolean(config, 'streamResponses');
  const showToolCalls = readBoolean(config, 'showToolCalls');
  const temperature = readNumber(config, 'temperature');
  const maxTokens = readNumber(config, 'maxTokens');
  const executionMode = readShellExecutionMode(message.config.executionMode);
  return {
    configuredProviders: message.config.configuredProviders ?? [],
    ...(message.config.selectedProviderId !== undefined
      ? { selectedProviderId: message.config.selectedProviderId }
      : {}),
    ...(message.config.selectedModelId !== undefined
      ? { selectedModelId: message.config.selectedModelId }
      : {}),
    ...(customSystemPrompt !== undefined ? { systemPrompt: customSystemPrompt } : {}),
    ...(autoExecuteTools !== undefined ? { autoExecuteTools } : {}),
    ...(streamResponses !== undefined ? { streamResponses } : {}),
    ...(showToolCalls !== undefined ? { showToolCalls } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(executionMode ? { executionMode } : {}),
    ...(Array.isArray(message.config.chatModelOptions)
      ? { chatModelOptions: readChatModelOptions(message.config.chatModelOptions) }
      : {}),
    ...(message.config.defaultMediaModels !== undefined
      ? { defaultMediaModels: readMediaModelDefaults(message.config.defaultMediaModels) }
      : {}),
    ...(Array.isArray(message.config.modelGroups)
      ? {
          modelGroups: readModelSourceGroups(message.config.modelGroups),
        }
      : {}),
    ...(mediaUnderstandingModels ? { mediaUnderstandingModels } : {}),
    configDiagnostic: readConfigDiagnostic(message.config.configDiagnostic),
  };
}

export function projectPluginCommandsMessage(
  message: PluginCommandsMessage,
): PluginSlashCommandProjection[] {
  return (message.commands ?? []).filter(isPluginSlashCommandProjection);
}

export function projectPluginsAvailableMessage(message: PluginsAvailableMessage): PluginsAvailable {
  return message.plugins ?? {};
}

export function projectSettingsMutationError(
  message: SettingsUpdatedMessage | ProviderMutationResultMessage,
): string | null {
  return message.success === false ? message.error || 'Settings update failed.' : null;
}

function readProviderViews(value: unknown): SettingsState['providers'] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProviderView);
}

function readChatModelOptions(value: unknown): ChatModelOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isChatModelOption);
}

function readModelSourceGroups(value: unknown): ModelSourceGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isModelSourceGroup);
}

function readMediaModelDefaults(value: unknown): MediaModelDefaults {
  const record = asRecord(value);
  if (!record) return {};

  const defaults: MediaModelDefaults = {};
  for (const category of AGENT_MEDIA_CATEGORIES) {
    const model = readString(record, category);
    if (model) defaults[category] = model;
  }
  return defaults;
}

function readMediaUnderstandingModels(value: unknown): MediaUnderstandingModels | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const image = readMediaUnderstandingModelStatus(
    record.image,
    'image',
    MEDIA_UNDERSTANDING_PURPOSES.image,
  );
  const audio = readMediaUnderstandingModelStatus(
    record.audio,
    'audio',
    MEDIA_UNDERSTANDING_PURPOSES.audio,
  );
  const video = readMediaUnderstandingModelStatus(
    record.video,
    'video',
    MEDIA_UNDERSTANDING_PURPOSES.video,
  );
  if (!image || !audio || !video) return undefined;
  return { image, audio, video };
}

function readMediaUnderstandingModelStatus(
  value: unknown,
  category: MediaUnderstandingCategory,
  purpose: MediaUnderstandingPurpose,
): MediaUnderstandingModelStatus | undefined {
  const record = asRecord(value);
  if (!record || record.category !== category || record.purpose !== purpose) {
    return undefined;
  }
  const status = record.status;
  if (!isMediaUnderstandingModelStatusValue(status)) {
    return undefined;
  }

  const source = readMediaUnderstandingModelSource(record.source);
  return {
    category,
    purpose,
    status,
    ...readOptionalStringProps(record, [
      'providerId',
      'modelId',
      'optionId',
      'label',
      'providerLabel',
    ]),
    ...(source ? { source } : {}),
  };
}

function isMediaUnderstandingModelStatusValue(
  value: unknown,
): value is MediaUnderstandingModelStatusValue {
  return value === 'configured' || value === 'auto' || value === 'missing';
}

function readMediaUnderstandingModelSource(
  value: unknown,
): MediaUnderstandingModelSource | undefined {
  return value === 'explicit-config' ? value : undefined;
}

function readOptionalStringProps(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = readString(record, key);
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function readConfigDiagnostic(value: unknown): SettingsState['configDiagnostic'] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const code = record.code;
  if (
    code !== 'empty' &&
    code !== 'invalidToml' &&
    code !== 'unsupportedVersion' &&
    code !== 'unsupportedProviderType' &&
    code !== 'unsupportedProviderConnectionKind' &&
    code !== 'unsupportedProviderProtocolProfile' &&
    code !== 'unsupportedProviderSupportLevel' &&
    code !== 'unsupportedProtocolAuthType' &&
    code !== 'unsupportedProtocolStreamFormat' &&
    code !== 'unsupportedModelProtocolProfile' &&
    code !== 'unsupportedModelProtocol' &&
    code !== 'duplicateProviderId' &&
    code !== 'duplicateModelId' &&
    code !== 'invalidDefaultMaxTokens' &&
    code !== 'invalidModelTokenMetadata' &&
    code !== 'unsupportedModelType' &&
    code !== 'unsupportedDefaultMediaModelType' &&
    code !== 'unsupportedDefaultModelType' &&
    code !== 'invalidDefaultModelBinding' &&
    code !== 'unsupportedWorkspaceProviderDefinition' &&
    code !== 'unsupportedWorkspaceModelDefinition' &&
    code !== 'unsupportedSkillSource' &&
    code !== 'readError' &&
    code !== 'missingConfig' &&
    code !== 'missingProvider' &&
    code !== 'missingModel' &&
    code !== 'missingApiKey' &&
    code !== 'invalidDefaultProvider' &&
    code !== 'invalidDefaultModel'
  ) {
    return undefined;
  }
  const filePath = readString(record, 'filePath');
  const message = readString(record, 'message');
  if (!filePath || !message) return undefined;
  return { code, filePath, message };
}

function projectSelectedChatModel(
  selectedModel: string,
  chatModelOptions: readonly ChatModelOption[] | undefined,
): ModelRef<'llm'> | undefined {
  if (selectedModel === 'auto') return undefined;

  const option = chatModelOptions?.find((candidate) => candidate.id === selectedModel);
  if (
    option?.providerId &&
    option.modelId &&
    (option.category === undefined || option.category === 'llm')
  ) {
    return { providerId: option.providerId, modelId: option.modelId, category: 'llm' };
  }

  return parseSelectedChatModel(selectedModel);
}

function parseSelectedChatModel(selectedModel: string): ModelRef<'llm'> | undefined {
  if (selectedModel === 'auto' || !selectedModel.includes(':')) return undefined;

  const parts = selectedModel.split(':');
  const providerId = parts[0];
  const modelId = parts.slice(1).join(':');
  if (!providerId || !modelId) return undefined;
  return { providerId, modelId, category: 'llm' };
}

function normalizeChatModelOptions(
  chatModelOptions: readonly ChatModelOption[],
): ChatModelOption[] {
  return [...chatModelOptions];
}

function isAgentMediaCategory(category: unknown): category is AgentMediaModelCategory {
  return AGENT_MEDIA_CATEGORIES.includes(category as AgentMediaModelCategory);
}

function isChatSelectableModel(model: ChatModelOption): boolean {
  return (
    Boolean(model.providerId && model.modelId) &&
    (model.category === undefined || model.category === 'llm')
  );
}

function isAgentMediaChatModelOption(model: ChatModelOption): model is ChatModelOption & {
  category: AgentMediaModelCategory;
} {
  return isAgentMediaCategory(model.category);
}

function projectAgentMediaModelSelections(
  mediaModelSelection: Readonly<MediaModelSelectionState>,
  availableMediaModels: readonly (ChatModelOption & { category: AgentMediaModelCategory })[],
): AgentMediaModelSelections | undefined {
  const result: AgentMediaModelSelections = {};

  const image = resolveAgentMediaModel('image', mediaModelSelection, availableMediaModels);
  if (image) result.image = image;
  const video = resolveAgentMediaModel('video', mediaModelSelection, availableMediaModels);
  if (video) result.video = video;
  const audio = resolveAgentMediaModel('audio', mediaModelSelection, availableMediaModels);
  if (audio) result.audio = audio;

  return Object.keys(result).length > 0 ? result : undefined;
}

function resolveAgentMediaModel<Category extends AgentMediaModelCategory>(
  category: Category,
  mediaModelSelection: Readonly<MediaModelSelectionState>,
  availableMediaModels: readonly (ChatModelOption & { category: AgentMediaModelCategory })[],
): ModelRef<Category> | undefined {
  const selectedId = mediaModelSelection[category];
  if (!selectedId || selectedId === 'none') return undefined;

  const model = availableMediaModels.find((candidate) => candidate.id === selectedId);
  if (!model?.providerId || !model.modelId || model.category !== category) return undefined;

  return {
    providerId: model.providerId,
    modelId: model.modelId,
    category,
  };
}

function projectDirectMediaModel(input: {
  sessionMode: MessageModelProjectionInput['sessionMode'];
  providerId?: string;
  modelId?: string;
}): ModelRef<MediaModelCategory> | undefined {
  if (
    input.sessionMode === 'agent' ||
    !input.providerId ||
    !input.modelId ||
    input.modelId === 'none'
  ) {
    return undefined;
  }

  return {
    providerId: input.providerId,
    modelId: input.modelId,
    category: input.sessionMode,
  };
}

function readShellExecutionMode(value: unknown): SettingsState['executionMode'] | undefined {
  if (value === 'plan' || value === 'ask' || value === 'auto') return value;
  return undefined;
}

function toAgentContextPayload(extra: ProjectMentionExtra): AgentContextPayload {
  return {
    type: extra.type,
    id: extra.id,
    label: extra.label,
    summary: extra.summary,
    data: {
      type: extra.type,
      id: extra.id,
      label: extra.label,
      summary: extra.summary,
      ...(extra.source ? { source: extra.source } : {}),
      ...(extra.filePath ? { filePath: extra.filePath } : {}),
      ...(extra.mediaType ? { mediaType: extra.mediaType } : {}),
      ...(extra.entityType ? { entityType: extra.entityType } : {}),
      ...(extra.navigationData ? { navigationData: extra.navigationData } : {}),
      ...(extra.thumbnailUri ? { thumbnailUri: extra.thumbnailUri } : {}),
    },
  };
}

function describeMentionExtra(extra: ProjectMentionExtra): string {
  if (extra.type === 'canvas-node') return 'Canvas node';
  if (extra.type === 'character') return 'Character';
  if (extra.type === 'scene') return 'Scene';
  if (extra.type === 'asset') return extra.entityType ? `Asset · ${extra.entityType}` : 'Asset';
  if (extra.type === 'media') {
    return extra.mediaType ? `Media · ${extra.mediaType}` : 'Media';
  }
  if (extra.type === 'entity') {
    const entityLabel = extra.navigationData?.candidateId ? 'Entity Candidate' : 'Entity';
    return extra.entityType ? `${entityLabel} · ${extra.entityType}` : entityLabel;
  }
  return extra.type;
}

function isProviderView(value: unknown): value is SettingsState['providers'][number] {
  const record = asRecord(value);
  if (!record) return false;
  if (!readString(record, 'id') || !readString(record, 'name')) return false;
  if (typeof record.isConfigured !== 'boolean') return false;
  if (!Array.isArray(record.models)) return false;
  return record.models.every(isProviderModelView);
}

function isProviderModelView(
  value: unknown,
): value is SettingsState['providers'][number]['models'][number] {
  const record = asRecord(value);
  return Boolean(
    record &&
    readString(record, 'id') &&
    readString(record, 'name') &&
    readString(record, 'description') !== undefined,
  );
}

function isChatModelOption(value: unknown): value is ChatModelOption {
  const record = asRecord(value);
  if (!record) return false;
  if (
    !readString(record, 'id') ||
    !readString(record, 'label') ||
    readString(record, 'providerId') === undefined ||
    readString(record, 'modelId') === undefined
  ) {
    return false;
  }
  const capabilities = record.capabilities;
  if (
    Array.isArray(capabilities) &&
    !capabilities.every((capability) => typeof capability === 'string')
  ) {
    return false;
  }

  const contextWindow = record.contextWindow;
  if (
    contextWindow !== undefined &&
    (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0)
  ) {
    return false;
  }
  const maxOutputTokens = record.maxOutputTokens;
  if (
    maxOutputTokens !== undefined &&
    (typeof maxOutputTokens !== 'number' ||
      !Number.isFinite(maxOutputTokens) ||
      maxOutputTokens <= 0)
  ) {
    return false;
  }

  const llmParameterControls = record.llmParameterControls;
  return llmParameterControls === undefined || isLlmParameterControls(llmParameterControls);
}

function isLlmParameterControls(value: unknown): value is ChatModelOption['llmParameterControls'] {
  const record = asRecord(value);
  if (!record) return false;
  return (
    typeof record.reasoning === 'boolean' &&
    typeof record.verbosity === 'boolean' &&
    typeof record.creativity === 'boolean' &&
    typeof record.maxOutputTokens === 'boolean'
  );
}

function isModelSourceGroup(value: unknown): value is ModelSourceGroup {
  const record = asRecord(value);
  if (!record) return false;
  if (record.source !== 'explicit-config') return false;
  if (!readString(record, 'providerId') || !readString(record, 'providerLabel')) return false;
  if (typeof record.priority !== 'number' || !Number.isFinite(record.priority)) return false;

  const modelsByType = asRecord(record.modelsByType);
  if (!modelsByType) return false;
  return Object.entries(modelsByType).every(([category, models]) => {
    return isModelType(category) && Array.isArray(models) && models.every(isChatModelOption);
  });
}

function isModelType(value: unknown): value is ModelType {
  return value === 'llm' || value === 'image' || value === 'video' || value === 'audio';
}

function isProjectFileMentionInfo(value: unknown): value is ProjectFileMentionInfo {
  const record = asRecord(value);
  return Boolean(
    record &&
    readString(record, 'path') &&
    readString(record, 'name') &&
    (record.type === 'file' || record.type === 'folder') &&
    (record.icon === undefined || typeof record.icon === 'string') &&
    (record.source === undefined || isProjectMentionSource(record.source)) &&
    (record.mediaType === undefined || isProjectMentionMediaType(record.mediaType)),
  );
}

function isProjectMentionExtra(value: unknown): value is ProjectMentionExtra {
  const record = asRecord(value);
  return Boolean(
    record &&
    isProjectMentionExtraType(record.type) &&
    readString(record, 'id') &&
    readString(record, 'label') &&
    readString(record, 'summary') &&
    (record.searchText === undefined || typeof record.searchText === 'string') &&
    (record.thumbnailUri === undefined || typeof record.thumbnailUri === 'string') &&
    (record.source === undefined || isProjectMentionSource(record.source)) &&
    (record.icon === undefined || typeof record.icon === 'string') &&
    (record.filePath === undefined || typeof record.filePath === 'string') &&
    (record.mediaType === undefined || isProjectMentionMediaType(record.mediaType)) &&
    (record.entityType === undefined || typeof record.entityType === 'string') &&
    (record.navigationData === undefined || isStringRecord(record.navigationData)),
  );
}

function isProjectMentionExtraType(value: unknown): value is ProjectMentionExtra['type'] {
  return (
    value === 'canvas-node' ||
    value === 'character' ||
    value === 'scene' ||
    value === 'asset' ||
    value === 'media' ||
    value === 'entity'
  );
}

function isProjectMentionSource(value: unknown): value is ProjectMentionExtra['source'] {
  return (
    value === 'workspace' ||
    value === 'asset-library' ||
    value === 'media-library' ||
    value === 'entity-graph' ||
    value === 'story' ||
    value === 'canvas'
  );
}

function isProjectMentionMediaType(value: unknown): value is ProjectMentionExtra['mediaType'] {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  const record = asRecord(value);
  return Boolean(record && Object.values(record).every((item) => typeof item === 'string'));
}

function isPluginSlashCommandProjection(value: unknown): value is PluginSlashCommandProjection {
  const record = asRecord(value);
  return Boolean(
    record &&
    readString(record, 'id') &&
    readString(record, 'name') &&
    readString(record, 'description') &&
    readString(record, 'extensionId') &&
    (record.icon === undefined || typeof record.icon === 'string'),
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

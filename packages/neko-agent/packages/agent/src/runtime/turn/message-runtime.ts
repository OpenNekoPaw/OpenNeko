import type {
  AgentLlmConfig,
  AgentFlatPurposeModelRefs,
  AgentFileReference,
  AgentMediaModelSelections,
  MediaUnderstandingModelSelections,
  AgentModelSlots,
  AgentQueuedMessageSource,
  ContentBlock,
  ErrorMessage,
  GlobalErrorMessage,
  MediaModelCategory,
  Message,
  MessageContextReference,
  ModelRef,
  ProjectFileMentionInfo,
  ProjectFilesWebviewMessage,
  ProjectMentionExtra,
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
  RuntimeMediaModelSelections,
  SessionMode,
  ThinkingMessage,
} from '@neko-agent/types';
import {
  buildErrorMessage,
  buildGlobalErrorMessage,
  buildThinkingMessage,
} from '@neko-agent/types';
import type {
  AgentContextPayload,
  DocumentContextData,
  DocumentLocator,
  MessageAttachment,
  ProviderGenerationCapability,
  ResourceRef,
} from '@neko/shared';
import { isDocumentFile, isModelPreviewContextData } from '@neko/shared';
import type { AgentEvent } from '../../session/types';
import { DEFAULT_MENTION_EXCLUDE_GLOB } from '../../input/mention-excludes';
import {
  extractFileReferencePaths,
  formatReadDocumentInstruction,
  normalizeAgentRuntimePromptLocale,
  type AgentBase64ImageAttachment,
  type AgentProcessedAttachments,
  type AgentRuntimePromptLocale,
} from '../../input/attachment-projection';
import { getLogger } from '../../utils/logger';

function getMessageRuntimeLogger() {
  return getLogger('MessageRuntime');
}

export interface AgentMessageExecutionOverrides {
  readonly executionMode?: 'auto' | 'ask' | 'plan';
  readonly metadata?: Record<string, unknown>;
}

export interface AgentLlmRuntimeOptions {
  /**
   * Marks that model capability projection already decided the per-turn LLM
   * options. When present, omitted values must stay omitted instead of using
   * session-level global settings.
   */
  readonly projected?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly providerOptions?: Record<string, unknown>;
}

export interface AgentModelTokenMetadata {
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
}

export interface AgentMessageIdOptions {
  readonly now?: () => number;
  readonly randomSuffix?: () => string;
}

export interface AgentMessageRuntimeRequest {
  readonly conversationId: string;
  readonly messageText: string;
  readonly pendingMessageSource?: AgentQueuedMessageSource;
  readonly sessionMode: SessionMode;
  readonly chatModel?: ModelRef<'llm'>;
  readonly agentModels?: AgentModelSlots;
  readonly llmConfig?: AgentLlmConfig;
  readonly llmRuntimeOptions?: AgentLlmRuntimeOptions;
  readonly modelTokenMetadata?: AgentModelTokenMetadata;
  readonly understandingModels?: MediaUnderstandingModelSelections;
  readonly purposeModels?: AgentFlatPurposeModelRefs;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly attachments?: MessageAttachment[];
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly fileReferences?: readonly AgentFileReference[];
  readonly promptId?: string;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly locale?: AgentRuntimePromptLocale | string;
}

export interface ProviderExpressionTargetConfig {
  readonly capability: ProviderGenerationCapability;
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
}

export interface AgentExecutionMetadataInput {
  readonly metadata?: Record<string, unknown>;
  readonly multimodalContextPacket?: unknown;
  readonly conversationId?: string;
  readonly parentAgentId?: string;
  readonly locale?: AgentRuntimePromptLocale | string;
}

export interface AgentReferencedFileContent {
  readonly path: string;
  readonly content: string;
}

export interface AgentReferencedDocument {
  readonly path: string;
}

interface AgentReferencedDocumentToken extends AgentReferencedDocument {
  readonly original?: string;
}

export interface AgentMessageFileReferenceProcessor {
  parseReferences?: (input: string) => readonly {
    path: string;
    original?: string;
  }[];
  process(input: string): Promise<{
    fileReferences: readonly {
      path: string;
      content?: string;
    }[];
    errors: readonly {
      reference: string;
      error: string;
    }[];
  }>;
}

export interface PrepareAgentMessageFileReferencesInput {
  readonly messageText: string;
  readonly inputProcessor?: AgentMessageFileReferenceProcessor | null;
  readonly onReferenceError?: (error: { reference: string; error: string }) => void;
  readonly onProcessingError?: (error: unknown) => void;
}

export interface PreparedAgentMessageFileReferences {
  readonly message: string;
  readonly fileContents: AgentReferencedFileContent[];
  readonly documentReferences: AgentReferencedDocument[];
}

export interface BuildEnhancedAgentMessageInput {
  readonly message: string;
  readonly fileContents?: readonly AgentReferencedFileContent[];
  readonly documentReferences?: readonly AgentReferencedDocument[];
  readonly attachmentText?: string;
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly locale?: AgentRuntimePromptLocale | string;
}

export interface AgentReferencedMediaProcessor {
  process(filePath: string): Promise<AgentProcessedReferencedMedia>;
}

export interface AgentProcessedReferencedMedia {
  readonly type: string;
  readonly images: readonly {
    readonly media_type: string;
    readonly data: string;
  }[];
  readonly metadata?: unknown;
}

export interface MergeReferencedMediaImageAttachmentsInput {
  readonly message: string;
  readonly existingImages: readonly AgentBase64ImageAttachment[];
  readonly createMediaProcessor?:
    | (() => AgentReferencedMediaProcessor | null | Promise<AgentReferencedMediaProcessor | null>)
    | undefined;
  readonly onProcessed?: (event: {
    filePath: string;
    mediaType: string;
    metadata?: unknown;
  }) => void;
  readonly onError?: (event: { filePath: string; error: unknown }) => void;
}

export type AgentMessageDispatchRoute =
  | {
      readonly kind: 'agent';
    }
  | {
      readonly kind: 'media';
      readonly mediaModel: ModelRef<MediaModelCategory>;
    };

export interface PrepareAgentMessageDispatchInput {
  readonly request: AgentMessageRuntimeRequest;
  readonly inputProcessor?: AgentMessageFileReferenceProcessor | null;
  readonly processAttachments: (
    attachments: readonly MessageAttachment[] | undefined,
    options?: { readonly locale?: AgentRuntimePromptLocale | string },
  ) => Promise<AgentProcessedAttachments>;
  readonly createReferencedMediaProcessor?:
    | (() => AgentReferencedMediaProcessor | null | Promise<AgentReferencedMediaProcessor | null>)
    | undefined;
  readonly resolveModelPreviewImage?: (
    previewImage: ResourceRef,
  ) => Promise<AgentBase64ImageAttachment>;
  readonly onReferenceError?: (error: { reference: string; error: string }) => void;
  readonly onFileReferenceProcessingError?: (error: unknown) => void;
  readonly onReferencedMediaProcessed?: (event: {
    filePath: string;
    mediaType: string;
    metadata?: unknown;
  }) => void;
  readonly onReferencedMediaError?: (event: { filePath: string; error: unknown }) => void;
  readonly generateMessageId: () => string;
  readonly now?: () => number;
}

export interface PreparedAgentMessageDispatch {
  readonly conversationId: string;
  readonly enhancedMessage: string;
  readonly userMessage: Message;
  readonly mediaImages: AgentBase64ImageAttachment[];
  readonly route: AgentMessageDispatchRoute;
}

export type AgentMessageTurnRuntimeMessage = ErrorMessage | GlobalErrorMessage | ThinkingMessage;

export interface AgentMessageTurnMediaExecutionInput {
  readonly conversationId: string;
  readonly prompt: string;
  readonly mediaModel: ModelRef<MediaModelCategory>;
  readonly selectedFileReferences?: readonly AgentFileReference[];
}

export interface AgentMessageTurnAgentExecutionInput {
  readonly conversationId: string;
  readonly message: string;
  readonly pendingMessageSource?: AgentQueuedMessageSource;
  readonly chatModel?: ModelRef<'llm'>;
  readonly agentModels?: AgentModelSlots;
  readonly llmConfig?: AgentLlmConfig;
  readonly llmRuntimeOptions?: AgentLlmRuntimeOptions;
  readonly modelTokenMetadata?: AgentModelTokenMetadata;
  readonly understandingModels?: MediaUnderstandingModelSelections;
  readonly purposeModels?: AgentFlatPurposeModelRefs;
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly locale?: AgentRuntimePromptLocale | string;
  readonly selectedFileReferences?: readonly AgentFileReference[];
}

export type AgentMessageTurnAgentExecutionResult =
  | {
      readonly status: 'queued';
      readonly pendingCount: number;
    }
  | {
      readonly status: 'completed';
    }
  | {
      readonly status: 'precondition-unmet';
      readonly reason: AgentMessageTurnPreconditionReason;
    }
  | {
      readonly status: 'failed';
      readonly error: unknown;
    };

export interface RunAgentMessageTurnRuntimeInput {
  readonly request: AgentMessageRuntimeRequest;
  readonly beforePrepareAgentTurn?: (input: {
    readonly conversationId: string;
    readonly userInput: string;
  }) => Promise<void> | void;
  readonly inputProcessor?: AgentMessageFileReferenceProcessor | null;
  readonly processAttachments: PrepareAgentMessageDispatchInput['processAttachments'];
  readonly createReferencedMediaProcessor?: PrepareAgentMessageDispatchInput['createReferencedMediaProcessor'];
  readonly resolveModelPreviewImage?: PrepareAgentMessageDispatchInput['resolveModelPreviewImage'];
  readonly persistUserMessage: (conversationId: string, message: Message) => void;
  readonly removeUserMessage?: (conversationId: string, messageId: string) => void;
  readonly persistErrorMessage?: (conversationId: string, message: Message) => void;
  readonly executeMediaTurn?: (input: AgentMessageTurnMediaExecutionInput) => Promise<void>;
  readonly executeAgentTurn?: (
    input: AgentMessageTurnAgentExecutionInput,
  ) => Promise<AgentMessageTurnAgentExecutionResult | void>;
  readonly postMessage: (message: AgentMessageTurnRuntimeMessage) => void;
  readonly onMissingConversationId?: () => void;
  readonly onReferenceError?: PrepareAgentMessageDispatchInput['onReferenceError'];
  readonly onFileReferenceProcessingError?: PrepareAgentMessageDispatchInput['onFileReferenceProcessingError'];
  readonly onReferencedMediaProcessed?: PrepareAgentMessageDispatchInput['onReferencedMediaProcessed'];
  readonly onReferencedMediaError?: PrepareAgentMessageDispatchInput['onReferencedMediaError'];
  readonly generateMessageId: () => string;
  readonly now?: () => number;
}

export type RunAgentMessageTurnRuntimeResult =
  | {
      readonly status: 'rejected-missing-conversation';
    }
  | {
      readonly status: 'media-dispatched';
    }
  | {
      readonly status: 'agent-dispatched';
    }
  | {
      readonly status: 'agent-queued';
      readonly pendingCount: number;
    }
  | {
      readonly status: 'agent-precondition-unmet';
      readonly reason: AgentMessageTurnPreconditionReason;
    }
  | {
      readonly status: 'agent-failed';
      readonly error: unknown;
    }
  | {
      readonly status: 'precondition-unmet';
      readonly reason: 'no-agent-runtime';
    };

export interface AgentAmbientCanvasNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
}

export interface AgentProjectFileSearchPlanInput {
  readonly filter?: string;
  readonly limit?: number;
  readonly purpose?: AgentProjectFileSearchPurpose;
}

export type AgentProjectFileSearchPurpose = 'mention' | 'roleplay' | 'entry';

export interface AgentProjectFileSearchPlan {
  readonly includePattern: string;
  readonly excludePattern: string;
  readonly limit: number;
  readonly purpose: AgentProjectFileSearchPurpose;
}

export interface AgentProjectFileCandidate {
  readonly relativePath: string;
  readonly icon?: string;
  readonly source?: ProjectMentionSource;
  readonly mediaType?: ProjectMentionMediaType;
}

export interface AgentMentionCharacter {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
  readonly thumbnailUri?: string;
}

export interface AgentMentionScene {
  readonly id: string;
  readonly title: string;
  readonly heading?: string;
}

export interface AgentProjectMentionCandidate {
  readonly type: ProjectMentionExtraType;
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly searchText?: string;
  readonly source?: ProjectMentionSource;
  readonly icon?: string;
  readonly filePath?: string;
  readonly mediaType?: ProjectMentionMediaType;
  readonly entityType?: string;
  readonly thumbnailUri?: string;
  readonly navigationData?: Record<string, string>;
}

export interface AgentProjectFilesProjectionInput {
  readonly conversationId?: string;
  readonly filter?: string;
  readonly purpose?: AgentProjectFileSearchPurpose;
  readonly files: readonly AgentProjectFileCandidate[];
  readonly canvasNodes?: readonly AgentAmbientCanvasNode[];
  readonly characters?: readonly AgentMentionCharacter[];
  readonly scenes?: readonly AgentMentionScene[];
  readonly mentionCandidates?: readonly AgentProjectMentionCandidate[];
}

export interface ExecuteAgentProjectFileSearchInput {
  readonly conversationId?: string;
  readonly filter?: string;
  readonly purpose?: AgentProjectFileSearchPurpose;
  readonly searchProjectFiles?: (
    plan: AgentProjectFileSearchPlan,
  ) => Promise<readonly AgentProjectFileCandidate[]>;
  readonly getCanvasNodes?: (conversationId: string) => readonly AgentAmbientCanvasNode[];
  readonly getCharacters?: () => Promise<readonly AgentMentionCharacter[]>;
  readonly getScenes?: () => Promise<readonly AgentMentionScene[]>;
  readonly getMentionCandidates?: (
    plan: AgentProjectFileSearchPlan,
  ) => Promise<readonly AgentProjectMentionCandidate[]>;
  readonly onSearchError?: (error: unknown) => void;
}

export interface AgentStreamPersistenceSnapshot {
  readonly accumulatedResponse: string;
  readonly accumulatedThinking: string;
  readonly hasError: boolean;
  readonly terminalStatus?: 'completed' | 'cancelled' | 'failed';
  readonly errorMessage?: string;
  readonly collectedToolCalls: readonly {
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
    readonly result?: { success: boolean; data: unknown; error?: string };
  }[];
  readonly contentBlocks: readonly ContentBlock[];
}

export interface BuildAgentAssistantMessageInput {
  readonly id: string;
  readonly timestamp: number;
  readonly stream: AgentStreamPersistenceSnapshot;
}

export interface BuildAgentErrorAssistantMessageInput {
  readonly id: string;
  readonly timestamp: number;
  readonly message?: string;
}

export interface AgentTurnContextPatchInput {
  readonly imageAttachments?: readonly AgentBase64ImageAttachment[];
  readonly timelineContextPacket?: unknown;
  readonly canvasNodes?: readonly AgentAmbientCanvasNode[];
  readonly canvasContextPacket?: unknown;
  readonly multimodalContextPacket?: unknown;
  readonly executionMetadata?: Record<string, unknown>;
}

export interface AgentTurnContextPatch {
  readonly imageAttachments?: AgentBase64ImageAttachment[];
  readonly canvasContext?: {
    readonly selectedNodes: AgentAmbientCanvasNode[];
  };
  readonly multimodalContextPacket?: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentProviderCandidate {
  readonly id: string;
  readonly isConfigured: boolean;
  readonly modelIds?: readonly string[];
  readonly source?: 'explicit-config' | 'account-gateway';
  readonly accountCatalogAvailable?: boolean;
  readonly entitledModelIds?: readonly string[];
  readonly modelCapabilities?: Readonly<Record<string, readonly string[]>>;
}

export interface AgentTurnProviderSelectionInput<TProvider extends AgentProviderCandidate> {
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly requiredCapabilities?: readonly string[];
  readonly getProvider: (providerId: string) => TProvider | undefined;
}

export type AgentTurnProviderSelection<TProvider extends AgentProviderCandidate> =
  | {
      readonly ok: true;
      readonly provider: TProvider;
      readonly effectiveProviderId?: string;
      readonly effectiveModelId: string;
    }
  | {
      readonly ok: false;
      readonly effectiveProviderId?: string;
      readonly effectiveModelId?: string;
      readonly reason:
        | 'missing-chat-provider'
        | 'missing-chat-model'
        | 'chat-provider-not-configured'
        | 'chat-model-not-found'
        | 'account-catalog-missing'
        | 'account-model-not-entitled'
        | 'missing-required-capability';
    };

export interface AgentTurnRuntimePlanInput {
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly understandingModels?: MediaUnderstandingModelSelections;
}

export interface AgentTurnRuntimePlan {
  readonly providerExpressionTargets?: ProviderExpressionTargetConfig[];
  readonly runtimeMediaModels?: RuntimeMediaModelSelections;
  readonly executionMetadata?: Record<string, unknown>;
}

export interface AgentTurnConfigurationPlanInput {
  readonly conversationId: string;
  readonly baseSystemPrompt: string;
  readonly customSystemPrompt?: string | null;
  readonly ambientCanvas?: readonly AgentAmbientCanvasNode[];
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly chatModel?: ModelRef<'llm'>;
  readonly mediaModel?: ModelRef<MediaModelCategory>;
  readonly mediaModels?: AgentMediaModelSelections;
  readonly understandingModels?: MediaUnderstandingModelSelections;
  readonly executionOverrides?: AgentMessageExecutionOverrides;
  readonly maxIterations?: number;
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly providerOptions?: Record<string, unknown>;
  readonly workspaceRoot?: string;
}

export interface AgentTurnConfigurationPlan {
  readonly systemPrompt: string;
  readonly maxIterations: number;
  readonly autoExecuteTools?: boolean;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly providerExpressionTargets?: ProviderExpressionTargetConfig[];
  readonly executionMode: 'auto' | 'ask' | 'plan';
  readonly thinkingBudget?: number;
  readonly providerOptions?: Record<string, unknown>;
  readonly workspaceRoot?: string;
  readonly conversationId: string;
  readonly executionMetadata?: Record<string, unknown>;
}

const MEDIA_GENERATION_CAPABILITIES: readonly ProviderGenerationCapability[] = [
  'image.generate',
  'video.generate',
  'audio.generate',
];

export type AgentMessageTurnPreconditionReason =
  | 'missing-platform'
  | 'no-provider-configured'
  | 'missing-chat-provider'
  | 'missing-chat-model'
  | 'chat-provider-not-configured'
  | 'chat-model-not-found'
  | 'account-catalog-missing'
  | 'account-model-not-entitled'
  | 'missing-required-capability';

export const AGENT_TURN_PRECONDITION_MESSAGE =
  'No valid chat provider and model are selected. Please choose a configured Agent chat provider/model in Settings.';

const AGENT_TURN_PRECONDITION_MESSAGES: Record<AgentMessageTurnPreconditionReason, string> = {
  'missing-platform': AGENT_TURN_PRECONDITION_MESSAGE,
  'no-provider-configured': AGENT_TURN_PRECONDITION_MESSAGE,
  'missing-chat-provider':
    'No chat provider is selected. Please choose a configured provider in Settings.',
  'missing-chat-model': 'No chat model is selected. Please choose a model in Settings.',
  'chat-provider-not-configured':
    'The selected chat provider is missing, disabled, or not configured. Please fix the provider in Settings.',
  'chat-model-not-found':
    'The selected chat model is missing, disabled, or does not belong to the selected provider. Please choose a valid model in Settings.',
  'account-catalog-missing':
    'The selected Neko account model is unavailable because the account AI catalog is missing or stale. Log in again or refresh Agent.',
  'account-model-not-entitled':
    'The selected Neko account model is not available for this account. Choose an entitled model or update the account plan.',
  'missing-required-capability':
    'The selected model does not support the required workflow capability. Choose a model with the needed vision or generation capability.',
};

export function getAgentTurnPreconditionMessage(
  reason: AgentMessageTurnPreconditionReason,
): string {
  return AGENT_TURN_PRECONDITION_MESSAGES[reason];
}

export function createAgentMessageId(options: AgentMessageIdOptions = {}): string {
  const timestamp = options.now?.() ?? Date.now();
  const suffix = options.randomSuffix?.() ?? Math.random().toString(36).slice(2, 11);
  return `${timestamp}-${suffix}`;
}

export async function prepareAgentMessageFileReferences(
  input: PrepareAgentMessageFileReferencesInput,
): Promise<PreparedAgentMessageFileReferences> {
  const inputProcessor = input.inputProcessor;
  if (!inputProcessor) {
    return { message: input.messageText, fileContents: [], documentReferences: [] };
  }

  const documentReferences = projectDocumentFileReferences(input.messageText, inputProcessor);
  const publicDocumentReferences: AgentReferencedDocument[] = documentReferences.map((ref) => ({
    path: ref.path,
  }));
  const processableMessageText =
    documentReferences.length > 0
      ? removeOriginalFileReferenceTokens(input.messageText, documentReferences)
      : input.messageText;

  try {
    const result =
      processableMessageText.trim().length > 0
        ? await inputProcessor.process(processableMessageText)
        : { fileReferences: [], errors: [] };
    const fileContents = result.fileReferences
      .filter((ref): ref is { path: string; content: string } => typeof ref.content === 'string')
      .map((ref) => ({
        path: ref.path,
        content: ref.content,
      }));

    for (const error of result.errors) {
      input.onReferenceError?.(error);
    }

    return {
      message: input.messageText,
      fileContents,
      documentReferences: publicDocumentReferences,
    };
  } catch (error) {
    input.onProcessingError?.(error);
    return {
      message: input.messageText,
      fileContents: [],
      documentReferences: publicDocumentReferences,
    };
  }
}

function projectDocumentFileReferences(
  messageText: string,
  inputProcessor: AgentMessageFileReferenceProcessor,
): AgentReferencedDocumentToken[] {
  const references = inputProcessor.parseReferences?.(messageText) ?? [];
  return references
    .filter((ref) => isDocumentFile(ref.path))
    .map((ref) => ({
      path: ref.path,
      ...(ref.original ? { original: ref.original } : {}),
    }));
}

function removeOriginalFileReferenceTokens(
  messageText: string,
  references: readonly AgentReferencedDocumentToken[],
): string {
  let next = messageText;
  for (const reference of references) {
    if (!reference.original) continue;
    next = next.replace(reference.original, '');
  }
  return next;
}

export async function mergeReferencedMediaImageAttachments(
  input: MergeReferencedMediaImageAttachmentsInput,
): Promise<AgentBase64ImageAttachment[]> {
  const paths = extractFileReferencePaths(input.message);
  const result = [...input.existingImages];

  if (paths.length === 0) {
    return result;
  }

  const mediaProcessor = (await input.createMediaProcessor?.()) ?? null;
  if (!mediaProcessor) {
    return result;
  }

  for (const filePath of paths) {
    try {
      const processed = await mediaProcessor.process(filePath);
      if (processed.type === 'unsupported') {
        continue;
      }

      for (const image of processed.images) {
        result.push({
          type: 'base64',
          media_type: image.media_type,
          data: image.data,
        });
      }

      input.onProcessed?.({
        filePath,
        mediaType: processed.type,
        ...(processed.metadata !== undefined ? { metadata: processed.metadata } : {}),
      });
    } catch (error) {
      input.onError?.({ filePath, error });
    }
  }

  return result;
}

export function projectContextReferences(
  payloads: readonly AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((payload) => {
    const navigationData = extractContextNavigationData(payload);
    return {
      type: payload.type,
      id: payload.id,
      label: payload.label,
      ...(payload.summary ? { summary: payload.summary } : {}),
      ...(navigationData ? { navigationData } : {}),
    };
  });
}

export function projectUserMessageContextReferences(input: {
  readonly contextPayloads?: readonly AgentContextPayload[];
  readonly fileReferences?: readonly AgentFileReference[];
}): MessageContextReference[] | undefined {
  const references: MessageContextReference[] = [];
  const seenIds = new Set<string>();

  for (const reference of projectContextReferences(input.contextPayloads) ?? []) {
    references.push(reference);
    seenIds.add(reference.id);
  }

  for (const reference of input.fileReferences ?? []) {
    if (seenIds.has(reference.id)) {
      continue;
    }
    references.push(projectFileReferenceContextReference(reference));
    seenIds.add(reference.id);
  }

  return references.length > 0 ? references : undefined;
}

function projectFileReferenceContextReference(
  reference: AgentFileReference,
): MessageContextReference {
  return {
    type: fileReferenceContextType(reference),
    id: reference.id,
    label: reference.label,
    summary: reference.path,
    ...(reference.thumbnailUri ? { thumbnailUri: reference.thumbnailUri } : {}),
    ...(reference.mediaType ? { mediaType: reference.mediaType } : {}),
    navigationData: {
      path: reference.path,
      filePath: reference.path,
    },
  };
}

function fileReferenceContextType(reference: AgentFileReference): MessageContextReference['type'] {
  if (reference.mediaType === 'image') return 'image';
  if (reference.mediaType === 'audio') return 'audio-clip';
  if (
    reference.mediaType === 'video' ||
    reference.mediaType === 'sequence' ||
    reference.source === 'media-library'
  ) {
    return 'media';
  }
  if (reference.source === 'asset-library') return 'asset';
  if (reference.source === 'entity-graph') return 'entity';
  return 'file';
}

function extractContextNavigationData(
  payload: AgentContextPayload,
): Record<string, string> | undefined {
  const data = payload.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== 'object') return undefined;
  const nav: Record<string, string> = {};
  if (typeof data['filePath'] === 'string') nav['filePath'] = data['filePath'];
  if (typeof data['path'] === 'string') nav['path'] = data['path'];
  if (payload.type === 'canvas-node') nav['nodeId'] = payload.id;
  return Object.keys(nav).length > 0 ? nav : undefined;
}

export async function prepareAgentMessageDispatch(
  input: PrepareAgentMessageDispatchInput,
): Promise<PreparedAgentMessageDispatch> {
  const startTime = Date.now();
  const request = input.request;
  const logger = getMessageRuntimeLogger();
  logger.debug('neko.agent.message.assembly.request', {
    conversationId: request.conversationId,
    sessionMode: request.sessionMode,
    messageChars: request.messageText.length,
    attachmentCount: request.attachments?.length ?? 0,
    attachmentSummary: summarizeMessageAttachments(request.attachments),
    contextPayloadCount: request.contextPayloads?.length ?? 0,
    contextPayloadSummary: summarizeContextPayloads(request.contextPayloads),
    fileReferenceCount: request.fileReferences?.length ?? 0,
    fileReferenceSummary: summarizeFileReferences(request.fileReferences),
    hasChatModel: request.chatModel !== undefined,
    hasMediaModel: request.mediaModel !== undefined,
    mediaModelCategories: request.mediaModels ? Object.keys(request.mediaModels) : [],
    promptId: request.promptId,
    hasExecutionOverrides: request.executionOverrides !== undefined,
    hasAgentModels: request.agentModels !== undefined,
    hasLlmConfig: request.llmConfig !== undefined,
    hasLlmRuntimeOptions: request.llmRuntimeOptions !== undefined,
  });
  logger.debug('neko.agent.message.assembly.request.raw', {
    conversationId: request.conversationId,
    sessionMode: request.sessionMode,
    messageText: request.messageText,
    attachments: sanitizeAttachmentsForDebugLog(request.attachments),
    contextPayloads: sanitizeForDebugLog(request.contextPayloads),
    fileReferences: sanitizeForDebugLog(request.fileReferences),
    chatModel: request.chatModel,
    mediaModel: request.mediaModel,
    mediaModels: request.mediaModels,
    promptId: request.promptId,
    executionOverrides: sanitizeForDebugLog(request.executionOverrides),
    agentModels: request.agentModels,
    llmConfig: request.llmConfig,
    llmRuntimeOptions: request.llmRuntimeOptions,
  });

  const {
    message: parsedMessage,
    fileContents,
    documentReferences,
  } = await prepareAgentMessageFileReferences({
    messageText: request.messageText,
    inputProcessor: input.inputProcessor,
    onReferenceError: input.onReferenceError,
    onProcessingError: input.onFileReferenceProcessingError,
  });

  const { textContent: attachmentText, imageAttachments } = await input.processAttachments(
    request.attachments,
    { locale: request.locale },
  );
  const referencedMediaImages = await mergeReferencedMediaImageAttachments({
    message: parsedMessage,
    existingImages: imageAttachments,
    createMediaProcessor: input.createReferencedMediaProcessor,
    onProcessed: input.onReferencedMediaProcessed,
    onError: input.onReferencedMediaError,
  });
  const modelPreviewImages = await resolveModelPreviewContextImages(
    request.contextPayloads,
    input.resolveModelPreviewImage,
  );
  const mediaImages = [...referencedMediaImages, ...modelPreviewImages];

  const enhancedMessage = buildEnhancedAgentMessage({
    message: parsedMessage,
    contextPayloads: request.contextPayloads,
    fileContents,
    documentReferences,
    attachmentText,
    locale: request.locale,
  });
  const route: AgentMessageDispatchRoute =
    request.sessionMode !== 'agent' && request.mediaModel
      ? { kind: 'media', mediaModel: request.mediaModel }
      : { kind: 'agent' };

  logger.debug('neko.agent.message.assembly.result', {
    conversationId: request.conversationId,
    durationMs: Date.now() - startTime,
    routeKind: route.kind,
    inputMessageChars: request.messageText.length,
    parsedMessageChars: parsedMessage.length,
    enhancedMessageChars: enhancedMessage.length,
    referencedFileCount: fileContents.length,
    referencedFiles: fileContents.map((file) => ({
      path: file.path,
      chars: file.content.length,
    })),
    referencedDocumentCount: documentReferences.length,
    referencedDocuments: documentReferences,
    attachmentTextChars: attachmentText.length,
    imageAttachmentCount: imageAttachments.length,
    mediaImageCount: mediaImages.length,
    mediaImageSummary: summarizeBase64Images(mediaImages),
    contextPayloadCount: request.contextPayloads?.length ?? 0,
    fileReferenceCount: request.fileReferences?.length ?? 0,
  });
  logger.debug('neko.agent.message.assembly.result.raw', {
    conversationId: request.conversationId,
    route,
    parsedMessage,
    enhancedMessage,
    referencedFiles: fileContents,
    referencedDocuments: documentReferences,
    attachmentText,
    mediaImages: summarizeBase64Images(mediaImages),
    userMessageContent: request.messageText,
  });

  const contextReferences = projectUserMessageContextReferences({
    contextPayloads: request.contextPayloads,
    fileReferences: request.fileReferences,
  });

  return {
    conversationId: request.conversationId,
    enhancedMessage,
    userMessage: {
      id: input.generateMessageId(),
      role: 'user',
      content: request.messageText,
      timestamp: input.now?.() ?? Date.now(),
      ...(request.attachments && request.attachments.length > 0
        ? { attachments: request.attachments }
        : {}),
      ...(contextReferences ? { contextReferences } : {}),
    },
    mediaImages,
    route,
  };
}

export async function runAgentMessageTurnRuntime(
  input: RunAgentMessageTurnRuntimeInput,
): Promise<RunAgentMessageTurnRuntimeResult> {
  const conversationId = input.request.conversationId;
  if (!conversationId) {
    input.onMissingConversationId?.();
    input.postMessage(
      buildGlobalErrorMessage('Cannot send message without an explicit conversationId.'),
    );
    return { status: 'rejected-missing-conversation' };
  }

  await input.beforePrepareAgentTurn?.({
    conversationId,
    userInput: input.request.messageText,
  });

  const prepared = await prepareAgentMessageDispatch({
    request: input.request,
    inputProcessor: input.inputProcessor,
    processAttachments: input.processAttachments,
    createReferencedMediaProcessor: input.createReferencedMediaProcessor,
    resolveModelPreviewImage: input.resolveModelPreviewImage,
    onReferenceError: input.onReferenceError,
    onFileReferenceProcessingError: input.onFileReferenceProcessingError,
    onReferencedMediaProcessed: input.onReferencedMediaProcessed,
    onReferencedMediaError: input.onReferencedMediaError,
    generateMessageId: input.generateMessageId,
    now: input.now,
  });

  input.persistUserMessage(conversationId, prepared.userMessage);
  input.postMessage(buildThinkingMessage(conversationId));

  if (prepared.route.kind === 'media' && input.executeMediaTurn) {
    await input.executeMediaTurn({
      conversationId,
      prompt: prepared.enhancedMessage,
      mediaModel: prepared.route.mediaModel,
      ...(input.request.fileReferences
        ? { selectedFileReferences: input.request.fileReferences }
        : {}),
    });
    return { status: 'media-dispatched' };
  }

  if (input.executeAgentTurn) {
    const result = await input.executeAgentTurn({
      conversationId,
      message: prepared.enhancedMessage,
      ...(input.request.pendingMessageSource
        ? { pendingMessageSource: input.request.pendingMessageSource }
        : {}),
      chatModel: input.request.chatModel,
      agentModels: input.request.agentModels,
      llmConfig: input.request.llmConfig,
      llmRuntimeOptions: input.request.llmRuntimeOptions,
      understandingModels: input.request.understandingModels,
      purposeModels: input.request.purposeModels,
      imageAttachments: prepared.mediaImages,
      mediaModel: input.request.mediaModel,
      mediaModels: input.request.mediaModels,
      executionOverrides: withAgentRuntimeLocaleMetadata(
        input.request.executionOverrides,
        input.request.locale,
      ),
      locale: input.request.locale,
      ...(input.request.fileReferences
        ? { selectedFileReferences: input.request.fileReferences }
        : {}),
    });
    if (result?.status === 'queued') {
      input.removeUserMessage?.(conversationId, prepared.userMessage.id);
      return { status: 'agent-queued', pendingCount: result.pendingCount };
    }
    if (result?.status === 'precondition-unmet') {
      return {
        status: 'agent-precondition-unmet',
        reason: result.reason,
      };
    }
    if (result?.status === 'failed') {
      return { status: 'agent-failed', error: result.error };
    }
    return { status: 'agent-dispatched' };
  }

  const preconditionMessage = getAgentTurnPreconditionMessage('no-provider-configured');
  input.persistErrorMessage?.(
    conversationId,
    buildAgentErrorAssistantMessage({
      id: input.generateMessageId(),
      timestamp: input.now?.() ?? Date.now(),
      message: preconditionMessage,
    }),
  );
  input.postMessage(
    buildErrorMessage({
      conversationId,
      message: preconditionMessage,
    }),
  );
  return { status: 'precondition-unmet', reason: 'no-agent-runtime' };
}

export function buildEnhancedAgentMessage(input: BuildEnhancedAgentMessageInput): string {
  const fileContents = input.fileContents ?? [];
  const documentReferences = input.documentReferences ?? [];
  const contextPayloads = input.contextPayloads ?? [];
  const labels = getEnhancedMessageLabels(input.locale);
  let enhancedMessage = input.message;

  if (contextPayloads.length > 0) {
    enhancedMessage += `\n\n--- ${labels.attachedContext} ---`;
    for (const payload of contextPayloads) {
      enhancedMessage += `\n\n${formatAgentContextPayload(payload, input.locale)}`;
    }
  }

  if (fileContents.length > 0) {
    enhancedMessage += `\n\n--- ${labels.referencedFiles} ---`;
    for (const file of fileContents) {
      enhancedMessage += `\n\n### ${labels.file}: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``;
    }
  }

  if (documentReferences.length > 0) {
    enhancedMessage += `\n\n--- ${labels.referencedDocuments} ---`;
    for (const document of documentReferences) {
      enhancedMessage += `\n\n[${labels.document}: ${document.path}]\n${formatReadDocumentInstruction(document.path, input.locale)}`;
    }
  }

  if (input.attachmentText) {
    enhancedMessage += `\n\n--- ${labels.attachedFiles} ---${input.attachmentText}`;
  }

  return enhancedMessage;
}

export function formatAgentContextPayload(
  payload: AgentContextPayload,
  locale?: AgentRuntimePromptLocale | string,
): string {
  const labels = getEnhancedMessageLabels(locale);
  const documentContext =
    payload.type === 'document-selection' ? extractDocumentContextData(payload.data) : undefined;
  const text = extractAgentContextText(payload.data);
  const imageData = extractAgentContextImageData(payload.data);
  const filePath = extractAgentContextFilePath(payload.data);

  if (payload.type === 'model-preview') {
    if (!isModelPreviewContextData(payload.data)) {
      throw new Error('Model Preview context data is invalid.');
    }
    const data = payload.data;
    const lights = data.staging.lightRig.lights
      .map((light) => `${light.id}=${light.intensity.toFixed(1)}`)
      .join(', ');
    return [
      `[${labels.context}: ${payload.label}]`,
      `Format: ${data.format}`,
      `Model facts: ${data.facts.nodeCount} nodes, ${data.facts.meshCount} meshes, ${data.facts.materialCount} materials, ${data.facts.animationCount} animations`,
      `Bounds: ${data.facts.bounds.size.x.toFixed(3)} × ${data.facts.bounds.size.y.toFixed(3)} × ${data.facts.bounds.size.z.toFixed(3)}`,
      `Active camera: ${data.staging.activeCameraId}`,
      `Lighting: environment=${data.staging.lightRig.environmentIntensity.toFixed(1)}, ${lights}`,
      `Selected node: ${data.staging.selectedNodePath ?? 'none'}`,
      `Temporary transform patches: ${data.staging.transformPatches.length}`,
      `Source resource: ${data.source.id}`,
      `Preview resource: ${data.previewImage.id}`,
      `[${labels.imageAttached}]`,
    ].join('\n');
  }

  if (documentContext) {
    const lines = [`[${labels.document}: ${payload.label}]`];
    const source = documentContext.source;
    lines.push(`${labels.source}: ${source?.filePath ?? filePath ?? labels.unknown}`);
    if (source?.format) {
      lines.push(`${labels.format}: ${source.format}`);
    }
    const locatorText = formatDocumentLocator(documentContext.locator);
    if (locatorText) {
      lines.push(`${labels.locator}: ${locatorText}`);
    }
    const excerptText = documentContext.excerpt?.text ?? text;
    if (excerptText) {
      lines.push(`${labels.excerpt}:\n${excerptText}`);
    }
    if (imageData || documentContext.excerpt?.imageData) {
      lines.push(`[${labels.imageAttached}]`);
    }
    lines.push(labels.followUpReadDocument);
    return lines.join('\n');
  }

  if (text && imageData) {
    return `[${labels.content}: ${payload.label}]\n${text}\n[${labels.imageAttached}]`;
  }

  if (text) {
    return `[${labels.content}: ${payload.label}]\n${text}`;
  }

  if (imageData) {
    return `[${labels.image}: ${payload.label}]\n[${labels.imageAttached}]`;
  }

  if (filePath) {
    return `[${labels.file}: ${payload.label}]\n${filePath}`;
  }

  return `[${labels.context}: ${payload.label}]\n${payload.summary}`;
}

function getEnhancedMessageLabels(locale?: AgentRuntimePromptLocale | string): {
  readonly attachedContext: string;
  readonly referencedFiles: string;
  readonly referencedDocuments: string;
  readonly attachedFiles: string;
  readonly file: string;
  readonly document: string;
  readonly source: string;
  readonly format: string;
  readonly locator: string;
  readonly excerpt: string;
  readonly imageAttached: string;
  readonly followUpReadDocument: string;
  readonly content: string;
  readonly image: string;
  readonly context: string;
  readonly unknown: string;
} {
  if (normalizeAgentRuntimePromptLocale(locale) === 'zh') {
    return {
      attachedContext: '附加上下文',
      referencedFiles: '引用文件',
      referencedDocuments: '引用文档',
      attachedFiles: '附件',
      file: '文件',
      document: '文档',
      source: '来源',
      format: '格式',
      locator: '定位',
      excerpt: '摘录',
      imageAttached: '已附加图片',
      followUpReadDocument:
        '后续需要更多文档上下文时，使用上方结构化 source ref 调用 ReadDocument。',
      content: '内容',
      image: '图片',
      context: '上下文',
      unknown: '未知',
    };
  }
  return {
    attachedContext: 'Attached Context',
    referencedFiles: 'Referenced Files',
    referencedDocuments: 'Referenced Documents',
    attachedFiles: 'Attached Files',
    file: 'File',
    document: 'Document',
    source: 'Source',
    format: 'Format',
    locator: 'Locator',
    excerpt: 'Excerpt',
    imageAttached: 'Image attached',
    followUpReadDocument:
      'Follow-up: use ReadDocument with the structured source ref shown above when more document context is needed.',
    content: 'Content',
    image: 'Image',
    context: 'Context',
    unknown: 'unknown',
  };
}

export function buildAgentProjectFileSearchPlan(
  input: AgentProjectFileSearchPlanInput = {},
): AgentProjectFileSearchPlan {
  const filter = normalizeProjectFileFilter(input.filter);
  return {
    includePattern: filter ? `**/*${filter}*` : '**/*',
    excludePattern: DEFAULT_MENTION_EXCLUDE_GLOB,
    limit: input.limit ?? 30,
    purpose: input.purpose ?? 'mention',
  };
}

export async function executeAgentProjectFileSearch(
  input: ExecuteAgentProjectFileSearchInput,
): Promise<ProjectFilesWebviewMessage> {
  let files: readonly AgentProjectFileCandidate[] = [];
  let mentionCandidates: readonly AgentProjectMentionCandidate[] = [];
  const plan = buildAgentProjectFileSearchPlan({ filter: input.filter, purpose: input.purpose });

  if (plan.purpose !== 'roleplay') {
    try {
      files = input.searchProjectFiles ? await input.searchProjectFiles(plan) : [];
    } catch (error) {
      input.onSearchError?.(error);
    }
  }

  try {
    mentionCandidates = input.getMentionCandidates ? await input.getMentionCandidates(plan) : [];
  } catch (error) {
    input.onSearchError?.(error);
  }

  const [characters, scenes] = await Promise.all([
    input.getCharacters?.().catch(() => [] as AgentMentionCharacter[]) ?? [],
    input.getScenes?.().catch(() => [] as AgentMentionScene[]) ?? [],
  ]);

  return projectAgentProjectFilesMessage({
    conversationId: input.conversationId,
    filter: input.filter,
    purpose: input.purpose,
    files,
    canvasNodes: input.conversationId ? (input.getCanvasNodes?.(input.conversationId) ?? []) : [],
    characters,
    scenes,
    mentionCandidates,
  });
}

export function projectAgentProjectFilesMessage(
  input: AgentProjectFilesProjectionInput,
): ProjectFilesWebviewMessage {
  return {
    type: 'projectFiles',
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    filter: input.filter ?? '',
    ...(input.purpose === 'roleplay' || input.purpose === 'entry'
      ? { purpose: input.purpose }
      : {}),
    files: projectAgentFileMentions(input.files),
    mentionExtras: projectAgentMentionExtras(
      input.canvasNodes ?? [],
      input.filter,
      input.characters,
      input.scenes,
      input.mentionCandidates,
    ),
  };
}

export function projectAgentFileMentions(
  files: readonly AgentProjectFileCandidate[],
): ProjectFileMentionInfo[] {
  return files.map((file) => {
    const relativePath = normalizeRelativeProjectPath(file.relativePath);
    return {
      path: relativePath,
      name: getProjectPathBaseName(relativePath),
      type: 'file',
      ...(file.icon ? { icon: file.icon } : {}),
      ...(file.source ? { source: file.source } : {}),
      ...(file.mediaType ? { mediaType: file.mediaType } : {}),
    };
  });
}

export function projectAgentMentionExtras(
  canvasNodes: readonly AgentAmbientCanvasNode[],
  filter?: string,
  characters?: readonly AgentMentionCharacter[],
  scenes?: readonly AgentMentionScene[],
  mentionCandidates?: readonly AgentProjectMentionCandidate[],
): ProjectMentionExtra[] {
  const normalizedFilter = normalizeProjectFileFilter(filter).toLowerCase();
  const extras: ProjectMentionExtra[] = [];

  for (const node of canvasNodes) {
    if (!normalizedFilter || node.summary.toLowerCase().includes(normalizedFilter)) {
      extras.push({
        type: 'canvas-node',
        id: node.nodeId,
        label: node.summary,
        summary: `Canvas: ${node.summary}`,
        source: 'canvas',
      });
    }
  }

  if (characters) {
    for (const c of characters) {
      if (!normalizedFilter || c.name.toLowerCase().includes(normalizedFilter)) {
        extras.push({
          type: 'character',
          id: c.id,
          label: c.name,
          summary: `Character: ${c.name}${c.role ? ` (${c.role})` : ''}`,
          source: 'story',
          ...(c.thumbnailUri ? { thumbnailUri: c.thumbnailUri } : {}),
        });
      }
    }
  }

  if (scenes) {
    for (const s of scenes) {
      const text = `${s.title} ${s.heading ?? ''}`.toLowerCase();
      if (!normalizedFilter || text.includes(normalizedFilter)) {
        extras.push({
          type: 'scene',
          id: s.id,
          label: s.title,
          summary: `Scene: ${s.heading ?? s.title}`,
          source: 'story',
        });
      }
    }
  }

  if (mentionCandidates) {
    for (const candidate of mentionCandidates) {
      extras.push({
        type: candidate.type,
        id: candidate.id,
        label: candidate.label,
        summary: candidate.summary,
        ...(candidate.searchText ? { searchText: candidate.searchText } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        ...(candidate.icon ? { icon: candidate.icon } : {}),
        ...(candidate.filePath
          ? { filePath: normalizeRelativeProjectPath(candidate.filePath) }
          : {}),
        ...(candidate.mediaType ? { mediaType: candidate.mediaType } : {}),
        ...(candidate.entityType ? { entityType: candidate.entityType } : {}),
        ...(candidate.thumbnailUri ? { thumbnailUri: candidate.thumbnailUri } : {}),
        ...(candidate.navigationData ? { navigationData: candidate.navigationData } : {}),
      });
    }
  }

  return extras;
}

export function buildAgentAssistantMessageFromStream(
  input: BuildAgentAssistantMessageInput,
): Message | null {
  const stream = input.stream;
  if (!shouldPersistAgentAssistantStream(stream)) {
    return null;
  }

  return {
    id: input.id,
    role: 'assistant',
    content: buildAgentAssistantStreamContent(stream),
    timestamp: input.timestamp,
    contentBlocks: stream.contentBlocks.length > 0 ? [...stream.contentBlocks] : undefined,
    ...(stream.hasError ? { isError: true } : {}),
  };
}

function buildAgentAssistantStreamContent(stream: AgentStreamPersistenceSnapshot): string {
  if (!stream.errorMessage) {
    return stream.accumulatedResponse;
  }

  if (!stream.accumulatedResponse) {
    return stream.errorMessage;
  }

  return `${stream.accumulatedResponse.trimEnd()}\n\n${stream.errorMessage}`;
}

export function buildAgentErrorAssistantMessage(
  input: BuildAgentErrorAssistantMessageInput,
): Message {
  const content =
    input.message && input.message.trim().length > 0 ? input.message : 'An error occurred';
  return {
    id: input.id,
    role: 'assistant',
    content,
    timestamp: input.timestamp,
    isError: true,
  };
}

export function shouldPersistAgentAssistantStream(stream: AgentStreamPersistenceSnapshot): boolean {
  return Boolean(
    stream.accumulatedResponse ||
    stream.accumulatedThinking ||
    (stream.hasError && stream.errorMessage) ||
    stream.collectedToolCalls.length > 0 ||
    stream.contentBlocks.length > 0,
  );
}

export function buildAgentTurnContextPatch(
  input: AgentTurnContextPatchInput,
): AgentTurnContextPatch {
  const patch: AgentTurnContextPatch = {
    ...(input.imageAttachments && input.imageAttachments.length > 0
      ? { imageAttachments: [...input.imageAttachments] }
      : {}),
    ...(input.canvasNodes && input.canvasNodes.length > 0
      ? { canvasContext: { selectedNodes: [...input.canvasNodes] } }
      : {}),
    ...(input.multimodalContextPacket !== undefined && input.multimodalContextPacket !== null
      ? { multimodalContextPacket: input.multimodalContextPacket }
      : input.canvasContextPacket !== undefined && input.canvasContextPacket !== null
        ? { multimodalContextPacket: input.canvasContextPacket }
        : input.timelineContextPacket !== undefined && input.timelineContextPacket !== null
          ? { multimodalContextPacket: input.timelineContextPacket }
          : {}),
    ...(input.executionMetadata ? { metadata: input.executionMetadata } : {}),
  };

  return patch;
}

export function appendAmbientCanvasSystemPrompt(
  systemPrompt: string,
  nodes: readonly AgentAmbientCanvasNode[],
): string {
  if (nodes.length === 0) {
    return systemPrompt;
  }

  const nodeLines = nodes
    .map((node) => `  - [${node.type}] ${node.summary} (id: ${node.nodeId})`)
    .join('\n');
  return (
    systemPrompt +
    `\n\n## Current Canvas Selection\nThe user has selected the following canvas node(s):\n${nodeLines}\n` +
    'Use the registered Canvas provider capabilities when the task requires reading or changing these nodes.'
  );
}

export function appendPerceptionToolRoutingPrompt(
  systemPrompt: string,
  input: {
    readonly chatModel?: ModelRef<'llm'>;
    readonly understandingModels?: MediaUnderstandingModelSelections;
  },
): string {
  const modalities = getDifferentUnderstandingModelModalities(input);
  if (modalities.length === 0) {
    return systemPrompt;
  }

  const imageRoute = modalities.includes('image')
    ? 'For image evidence, call `perception.image.understand` with the stable ResourceRef and the relevant focus.'
    : '';
  const retainedDomainRoutes = modalities.filter((modality) => modality !== 'image');
  const domainRoute =
    retainedDomainRoutes.length === 0
      ? ''
      : `For ${retainedDomainRoutes.join(
          ' and ',
        )} evidence, use only a matching runtime-listed OpenNeko domain perception Tool; Pi does not provide a generic payload fallback for those modalities.`;
  return `${systemPrompt}\n\n## Runtime Media Perception Routing\n\nThe selected chat model is different from the configured ${modalities.join(
    ', ',
  )} perception model. When the user asks to inspect, describe, compare, OCR, judge quality, analyze style, or reason from media pixels/samples, do not stop because the chat model lacks native media input, and do not guess. ${imageRoute} ${domainRoute} Base the answer on returned structured evidence. If no stable resource reference or matching Tool is available, report the missing perception path instead of guessing from a prompt, file name, task id, or thumbnail label.`;
}

function getDifferentUnderstandingModelModalities(input: {
  readonly chatModel?: ModelRef<'llm'>;
  readonly understandingModels?: MediaUnderstandingModelSelections;
}): string[] {
  const models = input.understandingModels;
  if (!input.chatModel || !models) return [];

  const modalities: string[] = [];
  for (const modality of ['image', 'audio', 'video'] as const) {
    const model = models[modality];
    if (!model) continue;
    if (
      model.providerId !== input.chatModel.providerId ||
      model.modelId !== input.chatModel.modelId
    ) {
      modalities.push(modality);
    }
  }

  return modalities;
}

export function appendCustomSystemPromptOverlay(
  systemPrompt: string,
  customSystemPrompt?: string | null,
): string {
  const trimmed = customSystemPrompt?.trim();
  if (!trimmed) {
    return systemPrompt;
  }

  return `${systemPrompt}\n\n## User Custom Instructions\n${trimmed}\n\nThese user-defined instructions are an overlay. Follow them when they do not conflict with the base system prompt, runtime tool protocol, capability schemas, permission policy, or safety boundaries.`;
}

function normalizeProjectFileFilter(filter?: string): string {
  return (filter ?? '').trim();
}

function normalizeRelativeProjectPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function getProjectPathBaseName(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

export function selectAgentTurnProvider<TProvider extends AgentProviderCandidate>(
  input: AgentTurnProviderSelectionInput<TProvider>,
): AgentTurnProviderSelection<TProvider> {
  const effectiveProviderId = input.requestedProviderId;
  const effectiveModelId = input.requestedModelId;

  if (!effectiveProviderId) {
    return {
      ok: false,
      reason: 'missing-chat-provider',
      ...(effectiveModelId ? { effectiveModelId } : {}),
    };
  }

  if (!effectiveModelId) {
    return {
      ok: false,
      effectiveProviderId,
      reason: 'missing-chat-model',
    };
  }

  const provider = input.getProvider(effectiveProviderId);
  if (!provider?.isConfigured) {
    return {
      ok: false,
      effectiveProviderId,
      effectiveModelId,
      reason: 'chat-provider-not-configured',
    };
  }

  if (provider.modelIds && !provider.modelIds.includes(effectiveModelId)) {
    return {
      ok: false,
      effectiveProviderId,
      effectiveModelId,
      reason: 'chat-model-not-found',
    };
  }

  if (provider.source === 'account-gateway') {
    if (provider.accountCatalogAvailable === false) {
      return {
        ok: false,
        effectiveProviderId,
        effectiveModelId,
        reason: 'account-catalog-missing',
      };
    }
    if (provider.entitledModelIds && !provider.entitledModelIds.includes(effectiveModelId)) {
      return {
        ok: false,
        effectiveProviderId,
        effectiveModelId,
        reason: 'account-model-not-entitled',
      };
    }
  }

  const requiredCapabilities = input.requiredCapabilities ?? [];
  if (requiredCapabilities.length > 0) {
    const modelCapabilities = provider.modelCapabilities?.[effectiveModelId] ?? [];
    const hasRequiredCapabilities = requiredCapabilities.every((capability) =>
      modelCapabilitySetSatisfies(modelCapabilities, capability),
    );
    if (!hasRequiredCapabilities) {
      return {
        ok: false,
        effectiveProviderId,
        effectiveModelId,
        reason: 'missing-required-capability',
      };
    }
  }

  return {
    ok: true,
    provider,
    effectiveProviderId,
    effectiveModelId,
  };
}

const RUNTIME_MODEL_PURPOSE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  'llm.chat': ['llm.chat', 'chat'],
  'llm.vision': ['llm.vision', 'vision'],
  'image.generate': ['image.generate', 'text_to_image', 'image_generation'],
  'image.edit': ['image.edit', 'image_edit'],
  'image.understand': ['image.understand'],
  'video.generate': ['video.generate', 'text_to_video', 'video_generation'],
  'video.understand': ['video.understand'],
  'audio.generate': ['audio.generate', 'text_to_audio', 'audio'],
  'audio.tts': ['audio.tts', 'text_to_audio', 'audio'],
  'audio.understand': ['audio.understand'],
  'audio.music.generate': ['audio.music.generate', 'text_to_music'],
};

function modelCapabilitySetSatisfies(
  modelCapabilities: readonly string[],
  requiredCapability: string,
): boolean {
  const accepted = RUNTIME_MODEL_PURPOSE_CAPABILITIES[requiredCapability] ?? [requiredCapability];
  return accepted.some((capability) => modelCapabilities.includes(capability));
}

export function buildAgentTurnConfigurationPlan(
  input: AgentTurnConfigurationPlanInput,
): AgentTurnConfigurationPlan {
  const effectiveExecutionMode = input.executionOverrides?.executionMode ?? input.executionMode;
  const turnRuntime = buildAgentTurnRuntimePlan({
    executionMode: effectiveExecutionMode,
    executionOverrides: input.executionOverrides,
    mediaModel: input.mediaModel,
    mediaModels: input.mediaModels,
    understandingModels: input.understandingModels,
  });

  return {
    systemPrompt: appendPerceptionToolRoutingPrompt(
      appendAmbientCanvasSystemPrompt(
        appendCustomSystemPromptOverlay(input.baseSystemPrompt, input.customSystemPrompt),
        input.ambientCanvas ?? [],
      ),
      {
        chatModel: input.chatModel,
        understandingModels: input.understandingModels,
      },
    ),
    maxIterations: input.maxIterations ?? 200,
    autoExecuteTools: input.autoExecuteTools,
    temperature: input.temperature,
    topP: input.topP,
    maxTokens: input.maxTokens,
    providerId: input.chatModel?.providerId,
    modelId: input.chatModel?.modelId,
    providerExpressionTargets: turnRuntime.providerExpressionTargets,
    executionMode: effectiveExecutionMode,
    thinkingBudget: input.thinkingBudget,
    providerOptions: input.providerOptions,
    workspaceRoot: input.workspaceRoot,
    conversationId: input.conversationId,
    executionMetadata: turnRuntime.executionMetadata,
  };
}

export function buildAgentTurnRuntimePlan(input: AgentTurnRuntimePlanInput): AgentTurnRuntimePlan {
  const runtimeMediaModels = buildRuntimeMediaModelSelections(input.mediaModels, input.mediaModel);
  const executionMetadata = buildAgentTurnExecutionMetadata(
    input.executionMode,
    input.executionOverrides?.metadata,
    runtimeMediaModels,
    input.understandingModels,
  );

  return {
    providerExpressionTargets: buildProviderExpressionTargets(input.mediaModels, input.mediaModel),
    ...(runtimeMediaModels ? { runtimeMediaModels } : {}),
    ...(executionMetadata ? { executionMetadata } : {}),
  };
}

export function buildProviderExpressionTargets(
  agentMediaModels: AgentMediaModelSelections | undefined,
  mediaModel?: ModelRef<MediaModelCategory>,
): ProviderExpressionTargetConfig[] | undefined {
  if (agentMediaModels && Object.keys(agentMediaModels).length > 0) {
    const targets: ProviderExpressionTargetConfig[] = [];
    if (agentMediaModels.image) {
      targets.push({
        capability: 'image.generate',
        providerId: agentMediaModels.image.providerId,
        modelId: agentMediaModels.image.modelId,
        ...(agentMediaModels.image.providerExpressionProfileId
          ? { providerExpressionProfileId: agentMediaModels.image.providerExpressionProfileId }
          : {}),
      });
    }
    if (agentMediaModels.video) {
      targets.push({
        capability: 'video.generate',
        providerId: agentMediaModels.video.providerId,
        modelId: agentMediaModels.video.modelId,
        ...(agentMediaModels.video.providerExpressionProfileId
          ? { providerExpressionProfileId: agentMediaModels.video.providerExpressionProfileId }
          : {}),
      });
    }
    if (agentMediaModels.audio) {
      targets.push({
        capability: 'audio.generate',
        providerId: agentMediaModels.audio.providerId,
        modelId: agentMediaModels.audio.modelId,
        ...(agentMediaModels.audio.providerExpressionProfileId
          ? { providerExpressionProfileId: agentMediaModels.audio.providerExpressionProfileId }
          : {}),
      });
    }
    return targets;
  }

  if (!mediaModel) return undefined;

  return MEDIA_GENERATION_CAPABILITIES.map((capability) => ({
    capability,
    providerId: mediaModel.providerId,
    modelId: mediaModel.modelId,
    ...(mediaModel.providerExpressionProfileId
      ? { providerExpressionProfileId: mediaModel.providerExpressionProfileId }
      : {}),
  }));
}

export function buildRuntimeMediaModelSelections(
  agentMediaModels: AgentMediaModelSelections | undefined,
  mediaModel?: ModelRef<MediaModelCategory>,
): RuntimeMediaModelSelections | undefined {
  if (agentMediaModels && Object.keys(agentMediaModels).length > 0) {
    return {
      ...(agentMediaModels.image ? { image: agentMediaModels.image } : {}),
      ...(agentMediaModels.video ? { video: agentMediaModels.video } : {}),
      ...(agentMediaModels.audio ? { audio: agentMediaModels.audio } : {}),
    };
  }

  if (!mediaModel) return undefined;

  return {
    image: mediaModel,
    video: mediaModel,
    audio: mediaModel,
  };
}

export function buildAgentTurnExecutionMetadata(
  executionMode: 'auto' | 'ask' | 'plan',
  overrides?: Record<string, unknown>,
  mediaModels?: RuntimeMediaModelSelections,
  understandingModels?: MediaUnderstandingModelSelections,
): Record<string, unknown> | undefined {
  const merged = overrides;
  const hasMediaModels = mediaModels !== undefined && Object.keys(mediaModels).length > 0;
  const hasUnderstandingModels =
    understandingModels !== undefined && Object.keys(understandingModels).length > 0;
  if (!hasMediaModels && !hasUnderstandingModels) return merged;
  return {
    ...(merged ?? {}),
    ...(hasMediaModels ? { mediaModels } : {}),
    ...(hasUnderstandingModels ? { understandingModels } : {}),
  };
}

export function buildAgentExecutionMetadata(
  input: AgentExecutionMetadataInput,
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };

  if (input.multimodalContextPacket) {
    metadata['multimodalContextPacket'] = input.multimodalContextPacket;
  }
  if (input.conversationId) {
    metadata['conversationId'] = input.conversationId;
  }
  if (input.parentAgentId) {
    metadata['parentAgentId'] = input.parentAgentId;
  }
  if (input.locale) {
    metadata['locale'] = normalizeAgentRuntimePromptLocale(input.locale);
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function withAgentRuntimeLocaleMetadata(
  overrides: AgentMessageExecutionOverrides | undefined,
  locale: AgentRuntimePromptLocale | string | undefined,
): AgentMessageExecutionOverrides | undefined {
  if (!locale) return overrides;
  return {
    ...(overrides ?? {}),
    metadata: {
      ...(overrides?.metadata ?? {}),
      locale: normalizeAgentRuntimePromptLocale(locale),
    },
  };
}

export function summarizeAgentEventProgress(event: AgentEvent): string | undefined {
  switch (event.type) {
    case 'iteration': {
      if (!event.iteration) {
        return '20% Running iteration';
      }
      const percent = Math.min(90, Math.max(10, event.iteration.current * 10));
      return `${percent}% Iteration ${event.iteration.current}/${event.iteration.max}`;
    }
    case 'tool_call':
      return event.toolCall ? `35% Calling ${event.toolCall.name}` : '35% Calling tool';
    case 'tool_progress':
      return event.toolProgress
        ? `${Math.min(95, Math.max(0, event.toolProgress.percent))}% ${event.toolProgress.stage}`
        : '50% Tool running';
    case 'tool_result':
      return '75% Tool result received';
    case 'done':
      return '95% Finalizing';
    default:
      return undefined;
  }
}

function summarizeMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
): readonly Record<string, unknown>[] {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    hasPath: typeof attachment.path === 'string' && attachment.path.length > 0,
    path: attachment.path,
    hasPreview: typeof attachment.preview === 'string' && attachment.preview.length > 0,
    previewChars: attachment.preview?.length ?? 0,
  }));
}

function summarizeContextPayloads(
  payloads: readonly AgentContextPayload[] | undefined,
): readonly Record<string, unknown>[] {
  return (payloads ?? []).map((payload) => ({
    id: payload.id,
    type: payload.type,
    label: payload.label,
    summaryChars: payload.summary.length,
    dataKeys: isRecord(payload.data) ? Object.keys(payload.data) : [],
    hasText: extractAgentContextText(payload.data) !== undefined,
    hasImageData: extractAgentContextImageData(payload.data) !== undefined,
    hasFilePath: extractAgentContextFilePath(payload.data) !== undefined,
  }));
}

function summarizeFileReferences(
  references: readonly AgentFileReference[] | undefined,
): readonly Record<string, unknown>[] {
  return (references ?? []).map((reference) => ({
    id: reference.id,
    label: reference.label,
    path: reference.path,
    mediaType: reference.mediaType,
    source: reference.source,
    hasThumbnail: typeof reference.thumbnailUri === 'string' && reference.thumbnailUri.length > 0,
  }));
}

function summarizeBase64Images(
  images: readonly AgentBase64ImageAttachment[],
): readonly Record<string, unknown>[] {
  return images.map((image, index) => ({
    index,
    type: image.type,
    mediaType: image.media_type,
    dataChars: image.data.length,
  }));
}

function sanitizeAttachmentsForDebugLog(
  attachments: readonly MessageAttachment[] | undefined,
): readonly Record<string, unknown>[] {
  return (attachments ?? []).map((attachment) => ({
    ...attachment,
    ...(attachment.preview ? { preview: sanitizeMediaStringForDebugLog(attachment.preview) } : {}),
  }));
}

function sanitizeForDebugLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeMediaStringForDebugLog(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForDebugLog(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (isLikelyMediaDataKey(key) && typeof entry === 'string') {
        return [key, sanitizeMediaStringForDebugLog(entry)];
      }
      return [key, sanitizeForDebugLog(entry)];
    }),
  );
}

function isLikelyMediaDataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === 'data' ||
    normalized === 'imagedata' ||
    normalized === 'image' ||
    normalized === 'preview' ||
    normalized === 'thumbnail'
  );
}

function sanitizeMediaStringForDebugLog(value: string): string {
  if (value.startsWith('data:')) {
    const metadataEnd = value.indexOf(',');
    const metadata = metadataEnd >= 0 ? value.slice(0, metadataEnd) : 'data:';
    return `${metadata},<omitted ${value.length} chars>`;
  }

  if (value.length > 4096 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
    return `<base64 omitted ${value.length} chars>`;
  }

  return value;
}

function extractAgentContextText(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return optionalString(data['text']) ?? optionalString(data['selectedText']);
}

function extractAgentContextImageData(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return optionalString(data['imageData']);
}

async function resolveModelPreviewContextImages(
  payloads: readonly AgentContextPayload[] | undefined,
  resolver: PrepareAgentMessageDispatchInput['resolveModelPreviewImage'],
): Promise<AgentBase64ImageAttachment[]> {
  const modelPayloads = (payloads ?? []).filter((payload) => payload.type === 'model-preview');
  if (modelPayloads.length === 0) return [];
  if (!resolver) {
    throw new Error('Model Preview context requires a preview-image content resolver.');
  }
  const images: AgentBase64ImageAttachment[] = [];
  for (const payload of modelPayloads) {
    if (!isModelPreviewContextData(payload.data)) {
      throw new Error(`Invalid Model Preview context: ${payload.id}`);
    }
    const image = await resolver(payload.data.previewImage);
    if (image.type !== 'base64' || image.media_type !== 'image/png' || image.data.length === 0) {
      throw new Error(`Model Preview image resolver returned invalid evidence: ${payload.id}`);
    }
    images.push(image);
  }
  return images;
}

function extractAgentContextFilePath(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return optionalString(data['filePath']) ?? optionalString(data['path']);
}

function extractDocumentContextData(data: unknown): DocumentContextData | undefined {
  if (!isRecord(data)) return undefined;
  const source = data['source'];
  const locator = data['locator'];
  if (isRecord(source) || isRecord(locator) || isRecord(data['excerpt'])) {
    return data as DocumentContextData;
  }
  return undefined;
}

function formatDocumentLocator(locator: DocumentLocator | undefined): string | undefined {
  if (!locator) return undefined;
  switch (locator.kind) {
    case 'page':
      return `page ${locator.pageNumber}${locator.entryName ? ` (${locator.entryName})` : ''}`;
    case 'chapter':
      return `chapter ${locator.chapterHref}${locator.spineIndex !== undefined ? ` spine ${locator.spineIndex}` : ''}`;
    case 'slide':
      return `slide ${locator.slideNumber}`;
    case 'text-range':
      if (locator.startLine !== undefined || locator.endLine !== undefined) {
        return `lines ${locator.startLine ?? '?'}-${locator.endLine ?? '?'}`;
      }
      return `chars ${locator.startChar ?? '?'}-${locator.endChar ?? '?'}`;
    case 'region':
      return `page ${locator.pageNumber} region x=${locator.region.x} y=${locator.region.y} w=${locator.region.width} h=${locator.region.height}`;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

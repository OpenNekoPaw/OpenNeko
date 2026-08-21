/**
 * @neko/agent-runtime - Agent Application Package
 *
 * Host-neutral Agent application and OpenNeko product-boundary integrations.
 */

export {
  composeProviderImageBatches,
  normalizeProviderImage,
  normalizeProviderImageDataUri,
  type ProviderImageBatchLayout,
  type ProviderImageBatchResult,
  type ProviderImageBatchSource,
} from './provider/image-batch-transport';
export {
  projectMultimodalPacketToChatMessageAsync,
  projectMultimodalPacketToChatMessage,
  projectPerceptionCardToContentParts,
  resolveProviderInputModalities,
  type AsyncMultimodalMessageProjectionOptions,
  type AsyncMultimodalMessageProjectionResult,
  type PerceptionAssetLoader,
  type ProjectionDiagnostic,
  type ProviderInputModalities,
  type ProviderInputModalityResolverInput,
  type MultimodalMessageProjectionOptions,
  type ProviderReadyAssetPayload,
  type VisionPreprocessPolicy,
} from './provider/multimodal-message-projection';
// Export logger
export { setRootLogger, getLogger as getAgentLogger } from './utils/logger';

// Export errors
export { AgentError, type AgentErrorCategory, type AgentErrorInfo } from './errors';

// Export prompt file projection
export {
  DEFAULT_AGENTS_FILE_CONTENT,
  DEFAULT_NEW_PROMPT_NAME,
  PROMPT_FILE_EXTENSION,
  buildAgentsFileLoadPlan,
  buildAgentsFilePlan,
  buildPromptConfigFilePlan,
  buildPromptFileContent,
  createPromptFileRuntime,
  ensurePromptFileExtension,
  extractPromptNameFromContent,
  generatePromptFileId,
  generatePromptFileName,
  projectPromptFileInfo,
  promptFileInfoToConfig,
  shouldScanPromptFile,
  syncPromptFilesWithConfig,
  type AgentsFileLoadCandidate,
  type PromptFileInfo,
  type PromptFileScanResult,
  type PromptFileScanResult as AgentPromptFileScanResult,
  type AgentsFileFailurePlan,
  type AgentsFilePlan,
  type LoadedAgentsFile,
  type PromptFileRuntime,
  type PromptFileRuntimeFs,
  type PromptFileRuntimeLogger,
  type PromptFileRuntimeOptions,
  type PromptFileRuntimePath,
  type PromptFileRuntimeStatLike,
  type PromptFileSaveResult,
  type PromptConfigFilePlan,
  type SavePromptFileInput,
} from './prompt';

// Export session management
export {
  createConversationId,
  getConversationWorkDirHash,
  isCanonicalConversationId,
  parseConversationId,
  type ConversationIdOptions,
  type ParsedConversationId,
  type ExecutionMode,
  type CompressionResult,
} from './session';

// Export input processing
export {
  InputProcessor,
  createInputProcessor,
  NodeFileReader,
  createNodeFileReader,
  DEFAULT_MENTION_EXCLUDED_DIRECTORIES,
  DEFAULT_MENTION_EXCLUDE_GLOB,
  isMentionExcludedPath,
  createWorkspaceFileIgnoreRules,
  matchesGitignoreRules,
  normalizeRelativePath,
  parseGitignoreRules,
  shouldIgnoreWorkspaceFile,
  type WorkspaceFileIgnoreDecision,
  type WorkspaceFileIgnoreReason,
  type WorkspaceFileIgnoreRules,
  type FileReference,
  type ProcessedInput,
  type InputProcessorOptions,
  type IFileReader,
  type IInputProcessor,
} from './input';

// Export workspace/content layout helpers
export {
  NEKO_AGENTS_FILE_NAME,
  PERSONAL_NEKO_CONTENT_DIR,
  PROJECT_NEKO_CONTENT_DIR,
  NEKO_CONTENT_SUBDIRS,
  resolveAgentsFile,
  resolveNekoContentDir,
  resolvePersonalAgentsFile,
  resolvePersonalNekoContentDir,
  resolveProjectAgentsFile,
  resolveProjectNekoContentDir,
  type NekoContentSource,
  type NekoContentSubdir,
} from './workspace';

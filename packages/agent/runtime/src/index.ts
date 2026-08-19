/**
 * @neko/agent-runtime - Agent Application Package
 *
 * Host-neutral Pi conversation runtime and OpenNeko product-boundary integrations.
 */

// Re-export Agent contract types for convenience.
export type {
  ToolCallInfo,
  // Tool types
  IToolRegistry,
  Tool,
  ToolResult,
  ToolCategory,
  ToolCallRequest,
  ChatMessage,
} from '@neko/agent-contracts';

export type {
  IMCPClient,
  IMCPManager,
  MCPPrompt,
  MCPResource,
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolResult,
} from '@neko/agent-contracts';

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
export * from './tools/search/project-search-capability-provider';

export {
  PERCEPTION_AUDIO_TRANSCRIBE_METADATA,
  PERCEPTION_IMAGE_SIMILARITY_METADATA,
  PERCEPTION_IMAGE_CLASSIFY_METADATA,
  PERCEPTION_DESCRIBE_INPUT_METADATA,
  PERCEPTION_VIDEO_DETECT_SHOTS_METADATA,
  PerceptionAudioTranscribeTool,
  PerceptionImageSimilarityTool,
  PerceptionImageClassifyTool,
  PerceptionDescribeInputTool,
  PerceptionVideoDetectShotsTool,
  createPerceptionTools,
  type PerceptionAudioTranscribeToolConfig,
  type PerceptionImageSimilarityToolConfig,
  type PerceptionImageClassifyToolConfig,
  type PerceptionToolMetadata,
  type PerceptionToolResult,
  type PerceptionClassifyClient,
  type PerceptionDetectShotsClient,
  type PerceptionSimilarityClient,
  type PerceptionTranscribeClient,
  BuiltinTool,
  createTool,
  ToolRegistry,
  createToolRegistry,
  // Core file/system tools
  ReadTool,
  WriteTool,
  BashTool,
  type BashToolOptions,
  ListDirectoryTool,
  GrepTool,
  type GrepToolOptions,
  MemoryWriteTool,
  createCoreTools,
  type CoreToolsOptions,
  createContentReadCapabilityProvider,
  createImageUnderstandingCapabilityProvider,
} from './tools';

// Export logger
export { setRootLogger, getLogger as getAgentLogger } from './utils/logger';

// Export errors
export { AgentError, type AgentErrorCategory, type AgentErrorInfo } from './errors';

// Export executor

// Export MCP
export {
  StdioMCPClient,
  HttpMCPClient,
  createMCPClient,
  MCPManager,
  MCPTool,
  connectMCPServersRuntime,
  createMcpToolCreationOptionsForExternalResearch,
  createMCPTools,
  createAllMCPTools,
  MCPTestService,
  getMCPTestService,
  type MCPToolCallManager,
  type MCPToolDiscoveryManager,
  type MCPRuntimeBootstrapLogger,
  type MCPRuntimeBootstrapOptions,
  type MCPRuntimeBootstrapResult,
  type MCPRuntimeConnectionFailure,
  type MCPRuntimeManager,
  type MCPRuntimeToolRegistry,
  type MCPTestConfig,
  type MCPTestResult,
} from './mcp';

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
  // System Prompt Builder
  SystemPromptBuilder,
  createSystemPromptBuilder,
  runSystemPromptAgentsFileLoadRuntime,
  getDefaultPersonalPath,
  hasAgentsFile,
  BUILTIN_PROMPTS,
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
  BUILTIN_PLAN_PROMPT_ZH,
  type SystemPromptBuilderConfig,
  type SystemPromptAgentsFileRuntimeDeps,
  type SystemPromptAgentsFileRuntimeInput,
  type PromptExecutionMode,
  type PromptLocale,
  type AgentsSource,
  type AgentsLoadResult,
  type BuiltinPromptKey,
  type PromptCompositionFragmentProjection,
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

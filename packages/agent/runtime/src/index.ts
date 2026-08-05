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
  parseProviderCardMarkdown,
  ProviderCardRegistry,
  createProviderCardRegistry,
  ProviderRouter,
  createProviderRouter,
  loadProviderCardDirectory,
  registerProviderCardDirectory,
  registerRuntimeProviderCardDirectories,
  type ParseProviderCardOptions,
  type LoadProviderCardDirectoryOptions,
  type RegisterProviderCardDirectoryOptions,
  type ProviderCardLoaderFs,
  type ProviderCardDirent,
  type ProviderCardLoadError,
  type ProviderCardRuntimeLogger,
  type RegisterRuntimeProviderCardDirectoriesOptions,
  type RuntimeProviderCardDirectoryRegistrationResult,
  createProviderExpressionPromptFragments,
  type ProviderExpressionContextOptions,
} from './provider';

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
export * from './tools/entity/creative-entity-capability-provider';

export {
  AgentProfileRegistry,
  ArtifactProfileRegistry,
  ProviderExpressionProfileRegistry,
  createArtifactProfileRegistry,
  createProviderExpressionProfileRegistry,
  BUILTIN_ARTIFACT_PROFILES,
  type AgentProfileDescriptor,
  type AgentProfileRegistryOptions,
} from './profile';

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
  perceptionToolGroup,
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
  ToolCategoryRegistry,
  createToolCategoryRegistry,
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
  // Injection constants
  DEFAULT_INJECTION_CONFIG,
  CORE_TOOLS,
  createContentReadCapabilityProvider,
} from './tools';

// Export logger
export { setRootLogger, getLogger as getAgentLogger } from './utils/logger';

// Export errors
export { AgentError, type AgentErrorCategory, type AgentErrorInfo } from './errors';

// Export executor

// Export memory
export { FileProjectMemoryManager, createFileProjectMemoryManager, MemoryRecall } from './memory';
export type { MemoryRecallOptions, RecalledMemory } from './memory';

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

// Export validation
export {
  // Types
  type ImageConstraints,
  type OutputConstraints,
  type ValidationError,
  type ValidationWarning,
  type ValidationResult,
  type ValidationErrorType,
  type ImageInfo,
  type MermaidValidationResult,
  type MermaidBlockInfo,
  type MermaidBlockValidationResult,
  type JsonBlockInfo,
  type JsonBlockValidationResult,
  type ValidationResultWithBlocks,
  // Constants
  DEFAULT_IMAGE_CONSTRAINTS,
  DEFAULT_OUTPUT_CONSTRAINTS,
  // Image Validator
  ImageValidator,
  ImageValidationError,
  createImageValidator,
  // Output Validator
  OutputValidator,
  createOutputValidator,
  // Extractors
  MermaidExtractor,
  JsonExtractor,
  createMermaidExtractor,
  createJsonExtractor,
  // Validators
  MermaidValidator,
  JsonSchemaValidator,
  LengthValidator,
  createMermaidValidator,
  createJsonSchemaValidator,
  createLengthValidator,
  // Checkers
  MermaidBlockChecker,
  createMermaidBlockChecker,
} from './validation';

// Export permission
export {
  // Types
  type PermissionMode,
  type PermissionDecision,
  type PermissionRules,
  type PermissionConfig,
  type PermissionCheckResult,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
  type ConfirmToolCallback,
  // Constants
  DEFAULT_READ_ONLY_TOOLS,
  READ_ONLY_MCP_PREFIXES,
  DEFAULT_PERMISSION_CONFIG,
  PLAN_MODE_SYSTEM_REMINDER,
  // Rule Matcher
  PermissionRuleMatcher,
  createPermissionRuleMatcher,
  normalizeToolCall,
  matchesPattern,
  isInPatternList,
  isReadOnlyTool,
  isPlanMarkdownWrite,
  ToolTraitsRegistry,
  DEFAULT_CREATIVE_TOOL_TRAITS,
} from './permission';

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

// Export settings hook execution
export {
  type HookExecutionResult,
  type ISettingsFileSystem,
  type IShellExecutor,
  type LoadedSettingsHook,
  type SettingsHookLoadResult,
  type SettingsHookLoaderOptions,
  SettingsHookLoader,
  createSettingsHookLoader,
} from './hook-loader';

// Export session management
export {
  buildConversationHistoryClearedMessage,
  createConversationId,
  getConversationWorkDirHash,
  isCanonicalConversationId,
  parseConversationId,
  runCancelMessageRuntime,
  runClearAllConversationsRuntime,
  runClearHistoryRuntime,
  runConfirmToolRuntime,
  runDeleteConversationRuntime,
  runNewConversationRuntime,
  runSwitchConversationRuntime,
  type ConfirmToolRuntimeInput,
  type ConversationControlAction,
  type ConversationControlConversationInput,
  type ConversationControlDisposable,
  type ConversationControlRuntimeEffects,
  type ConversationControlRuntimeMessage,
  type ConversationControlRuntimeResult,
  type ConversationControlRuntimeWarning,
  type ConversationControlRuntimeWarningCode,
  type DeleteConversationRuntimeInput,
  type DeleteConversationRuntimeOptions,
  type ConversationIdOptions,
  type ParsedConversationId,
  type ExecutionMode,
  type CompressionResult,
  // Re-exported from permission
  type ToolConfirmationRequest as SessionToolConfirmationRequest,
  // Re-exported from validation
  type ValidationError as SessionValidationError,
  type ValidationWarning as SessionValidationWarning,
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
  NEKO_CONTENT_DIR,
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

/**
 * Tools Module - Tool base classes, registry, and injection management
 *
 * This module provides:
 * - BuiltinTool: Base class for implementing tools
 * - ToolRegistry: Registry for managing and executing tools
 * - ToolCategoryRegistry: Registry for tool categorization and layer management
 * - createTool: Factory function for creating simple tools
 *
 * Domain capability adapters live beside the Agent registry and delegate through
 * owning package ports; they do not implement domain behavior here.
 */

export {
  BuiltinTool,
  SAFETY_PRESETS,
  buildTool,
  createTool,
  type BuildToolConfig,
  type ToolSafetyPreset,
} from './base';

// Registry
export { ToolRegistry, createToolRegistry } from './tool-registry';
export { registerMediaAgentTools } from './generation/media-agent-tools';
export {
  createContentDocumentReadCapabilityProvider,
  createContentMediaReadCapabilityProvider,
  createContentReadCapabilityProvider,
  type ContentReadCapabilityProviderDeps,
} from './content/content-read-capability-provider';
export {
  createReadDocumentTool,
  type ReadDocumentContentAccessRuntime,
} from './content/read-document-tool';
export {
  createReadImageTool,
  executeReadImage,
  type ReadImageContentAccessRuntime,
} from './content/read-image-tool';

// Category registry
export { ToolCategoryRegistry, createToolCategoryRegistry } from './tool-category-registry';

export {
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
  authorizePathInsideRoots,
  isForbiddenUnmanagedPath,
  isPathInsideRoot,
  normalizeAccessRoots,
  type RootPathAccessDecision,
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessDecision,
  type CoreFileAccessDenialReason,
  type CoreFileAccessPolicy,
  type FileAccessKind,
  type WorkspaceFileAccessPolicyOptions,
  type WorkspaceFileIgnoreRules,
  // Draft/Plan/Task review documents are persisted by the host artifact service.
} from './core';

// Perception evidence tools
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
  type PerceptionVideoDetectShotsToolConfig,
  type PerceptionImageSimilarityToolConfig,
  type PerceptionImageClassifyToolConfig,
  type PerceptionClassifyClient,
  type PerceptionDetectShotsClient,
  type PerceptionSimilarityClient,
  type PerceptionTranscribeClient,
} from './perception';

// Re-export Agent-owned tool contracts for convenience.
export type {
  Tool,
  ToolCategory,
  ToolResult,
  ToolCallRequest,
  ToolExecutionConfig,
  IToolRegistry,
  // Category types
  ToolInjectionLayer,
  ToolCategoryInfo,
  CategorizedTool,
  IToolCategoryRegistry,
  // Injection types
  ToolInjectionConfig,
  ToolInjectionState,
  LayerTokenUsage,
  IToolInjectionManager,
  InjectionEvent,
  InjectionEventListener,
} from '@neko-agent/contracts';

export type { PerceptionToolMetadata, PerceptionToolResult } from '@neko-agent/contracts';

// Pattern matching utilities (shared by permission and skill modules)
export {
  normalizeToolCall,
  matchesPattern,
  isInPatternList,
  type ToolCallLike,
} from './tool-pattern-matcher';

// Tier resolver (tiered lazy loading)
export { resolveToolGroupTier } from './tier-resolver';

// Re-export injection constants
export { DEFAULT_INJECTION_CONFIG, CORE_TOOLS } from '@neko-agent/contracts';

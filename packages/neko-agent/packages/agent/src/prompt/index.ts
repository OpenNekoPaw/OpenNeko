/**
 * Prompt Module - Prompt template management for agents
 *
 * Provides:
 * - PromptManager: Template registration and rendering
 * - SystemPromptBuilder: Unified system prompt construction
 */

export { PromptManager, createPromptManager } from './prompt-manager';
// System Prompt Builder
export {
  SystemPromptBuilder,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  hasAgentsFile,
} from './system-prompt-builder';

export { runSystemPromptAgentsFileLoadRuntime } from './system-prompt-agents-file-runtime';
export type {
  SystemPromptAgentsFileRuntimeDeps,
  SystemPromptAgentsFileRuntimeInput,
} from './system-prompt-agents-file-runtime';

export type {
  ISystemPromptBuilder,
  SystemPromptBuilderConfig,
  PromptExecutionMode,
  PromptLocale,
  AgentsSource,
  AgentsLoadResult,
} from './system-prompt-builder-types';

export {
  BUILTIN_PROMPTS,
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
  BUILTIN_PLAN_PROMPT_ZH,
  type BuiltinPromptKey,
} from './builtin-prompts';

// System Prompt Composer
export type {
  ISystemPromptComposer,
  PromptLayer,
  PromptSection,
  PromptSectionInput,
  PromptLayerBudget,
  LayerUsage,
  SystemPromptComposerOptions,
  ComposedPromptSection,
  ComposedPromptResult,
  PromptDumpInfo,
  PromptCompositionFragmentProjection,
} from './system-prompt-composer-types';

// Prompt Module Framework (Stage A)
export type {
  PromptContext,
  PromptContextProvider,
  PromptContextSources,
  ArtifactIssue,
} from './context';

export type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from './registry/module-manifest';

// Content-projection modules (PR2 Stage C)
// AGENTS.md overlay module (PR3b)
// Schema-layer modules (PR3c)

// Sub-package prompt fragments module (PR3e)
// Prompt file host-neutral projection
export {
  DEFAULT_AGENTS_FILE_CONTENT,
  DEFAULT_NEW_PROMPT_NAME,
  PROMPT_FILE_EXTENSION,
  buildAgentsFileLoadPlan,
  buildAgentsFilePlan,
  buildPromptConfigFilePlan,
  buildPromptFileContent,
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
  type AgentsFileFailurePlan,
  type AgentsFilePlan,
  type PromptConfigFilePlan,
} from './prompt-file-projector';

export {
  createPromptFileRuntime,
  type LoadedAgentsFile,
  type PromptFileRuntime,
  type PromptFileRuntimeFs,
  type PromptFileRuntimeLogger,
  type PromptFileRuntimeOptions,
  type PromptFileRuntimePath,
  type PromptFileRuntimeStatLike,
  type PromptFileSaveResult,
  type SavePromptFileInput,
} from './prompt-file-runtime';

// Re-export types from @neko/shared for convenience
export type {
  Prompt,
  PromptVariable,
  PromptCategory,
  RenderedPrompt,
  IPromptManager,
} from '@neko/shared';

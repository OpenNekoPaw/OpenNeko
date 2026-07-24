/** Canonical base prompt construction and Host-owned prompt file support. */
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

export type { PromptCompositionFragmentProjection } from './prompt-composition-projection';

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

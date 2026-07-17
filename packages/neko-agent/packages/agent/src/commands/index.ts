/**
 * Commands Module
 *
 * Unified builtin command system for cli and extension.
 */

// Types
export type {
  BuiltinCommandName,
  BuiltinCommand,
  CommandCategory,
  CommandContext,
  CommandResult,
  CommandAction,
  CommandHandler,
  CommandHandlerRegistration,
  // Type-safe action data
  ConversationInfo,
  StatusData,
  CommandActionDataMap,
} from './types';

export { COMMAND_ALIASES, resolveCommandName } from './types';

export type {
  SlashCommandSurface,
  SlashCommandSkillLike,
  SlashCommandCatalogEntry,
} from './command-catalog';
export { listSlashCommandCatalog, resolveSlashCommandCatalogEntry } from './command-catalog';

// Builtin commands
export {
  BUILTIN_COMMANDS,
  getCliCommands,
  getExtensionCommands,
  getBuiltinCommand,
  isBuiltinCommand,
  getAllCommandNames,
} from './builtin-commands';

// Handlers
export {
  handleHelp,
  handleStatus,
  handleClear,
  handleExit,
  handleConfig,
  handleModel,
  handleSettings,
  handlePermissions,
  handleInit,
  handleNew,
  handleResume,
  handleCompact,
  handlePlan,
  handleSkills,
  handleCommands,
  handleTools,
  handleTasks,
  handleMcp,
  generateExtensionStatusData,
} from './handlers';

export {
  buildAgentTerminalHelpSemantic,
  executeAgentTerminalSkillsSemantic,
  executeAgentTerminalCommandsSemantic,
  executeAgentTerminalToolsSemantic,
  type AgentTerminalSkillRow,
  type AgentTerminalToolRow,
  type AgentTerminalHelpSemanticResult,
  type AgentTerminalSkillsSemanticResult,
  type AgentTerminalCommandsSemanticResult,
  type AgentTerminalToolsSemanticResult,
  type AgentTerminalResourceCommandSemanticResult,
  type AgentCommandSessionSemanticResult,
  type AgentCommandConfigSnapshot,
  type AgentCommandConfigSemanticResult,
  type AgentCommandCoreSemanticResult,
  type AgentCommandShellSemanticResult,
  type AgentCommandSemanticResult,
  isAgentCommandSemanticFailure,
} from './terminal-semantics';

// Executor
export {
  parseSlashCommand,
  isSlashCommand,
  executeBuiltinCommand,
  executeSlashCommand,
  getCommandHandler,
} from './command-executor';

export {
  buildExtensionCommandConversationSummaries,
  buildExtensionCommandHostEffectPlan,
  buildExtensionCommandResultPayload,
  normalizeSlashCommandName,
  parseBuiltinCommandArgs,
  type BuildExtensionCommandHostEffectPlanInput,
  type BuildExtensionCommandResultPayloadInput,
  type ExtensionCommandHostEffect,
  type ExtensionCommandHostEffectPlan,
  type ExtensionCommandConversationSummary,
  type ExtensionCommandConversationSummarySource,
  type ExtensionCommandResultPayload,
} from './extension-command-presenter';

export {
  buildExtensionSlashStatusPayload,
  runExtensionSlashCommandRuntime,
  type ExtensionSlashCommandContextManager,
  type ExtensionSlashCommandConversationSource,
  type ExtensionSlashCommandRuntimeDeps,
  type ExtensionSlashCommandRuntimeEffects,
  type ExtensionSlashCommandRuntimeInput,
  type ExtensionSlashCommandRuntimeResult,
  type ExtensionSlashCommandSettingsSource,
} from './extension-slash-command-runtime';

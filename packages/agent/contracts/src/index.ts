/**
 * @neko/agent-contracts — Shared type definitions for the neko-agent ecosystem
 *
 * Host-neutral contracts consumed by Agent application, Desktop adapters, and extension management.
 */

export * from './agent-ai-source';
export * from './agent-ui-contracts';
export * from './agent-context';
export * from './agent-file-reference';
export * from './agent-home';
export * from './agent-image-transport';
export * from './agent-availability';
export * from './canonical-base64';
export * from './agent-interaction-binding';
export * from './agent-model-catalog';
export * from './agent-conversation-context';
export * from './agent-conversation-binding';
export * from './agent-input-intent';
export * from './agent-llm-configuration';
export * from './agent-entry-intent';
export * from './config';
export * from './desktop-agent-connection';
export * from './dsh-acp';
export * from './dsh-permission-host';
export * from './dsh-runtime-host';
export * from './dsh-session-host';
export * from './dsh-skill-authoring';
export * from './effective-agent-configuration';
export * from './extension-management';
export * from './extension-management-host';
export * from './message-attachment';

export type {
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
  ProjectionAttachmentProtocolDiagnostic,
  ProjectionAttachmentProtocolDiagnosticCode,
  ProjectionAttachRequest,
  ProjectionDetachMessage,
  ProjectionPatchFrame,
  ProjectionSnapshotAcknowledgement,
  ProjectionSnapshotFrame,
} from './projection-attachment';
export { isSameProjectionAttachment } from './projection-attachment';
export type {
  AgentCommandCatalogEntry,
  AgentInputBindingRequirement,
  AgentInputCatalogEntry,
  AgentInputPhaseRequirement,
  AgentInputSourceReceipt,
  AgentInputTriggerKind,
  AgentInputTriggerPrefix,
  AgentMentionCatalogEntry,
  AgentSkillInvocationCatalogEntry,
  ParsedAgentInputTrigger,
  ParseAgentInputTriggerOptions,
} from './agent-input-trigger';
export {
  AGENT_INPUT_TRIGGER_PREFIXES,
  getAgentInputTriggerKind,
  getAgentInputTriggerPrefix,
  isAgentInputCatalogEntryExecutable,
  isAgentInputTriggerBoundary,
  isAgentInputTriggerPrefix,
  normalizeAgentInputTriggerName,
  parseAgentInputCatalog,
  parseAgentInputCatalogEntry,
  parseAgentInputTrigger,
} from './agent-input-trigger';
export { normalizeSlashCommandName } from './slash-command-utils';
export type { AgentConfigDiagnostic, AgentConfigDiagnosticCode } from './config-diagnostic';

// Builtin slash command metadata shared across runtime + UI surfaces
export type {
  BuiltinSlashCommandName,
  BuiltinSlashCommandCategory,
  BuiltinSlashCommandDefinition,
} from './builtin-slash-command';
export {
  BUILTIN_SLASH_COMMANDS,
  BUILTIN_SLASH_COMMAND_ALIASES,
  listBuiltinSlashCommands,
  getBuiltinSlashCommand,
} from './builtin-slash-command';

export * from './character-dialogue-handoff';
export * from './character-creation-handoff';
export * from './world-creation-handoff';
export * from './project-template-handoff';

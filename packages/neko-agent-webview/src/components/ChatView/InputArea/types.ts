/**
 * InputArea Types and Constants
 */

import type { AgentFileReference, AgentLlmConfig } from '@neko-agent/types';

// Re-export MessageAttachment from shared
export type { MessageAttachment, AttachmentType } from '@neko/shared';

// Command source type
export type CommandSource = 'builtin' | 'command-artifact' | 'plugin';

// Slash command definition
export interface SlashCommand {
  id: string;
  /** Raw command id used when dispatching to the host/runtime */
  commandId?: string;
  name: string;
  descriptionKey: string; // i18n key or direct description for skills
  icon: string;
  /** Command source: builtin, command artifact, or plugin */
  source?: CommandSource;
  /** Backing Skill ID if source is 'command-artifact' */
  skillId?: string;
  /** Extension ID if source is 'plugin' */
  extensionId?: string;
}

/**
 * Plugin slash command registered by an external extension via
 * `vscode.commands.executeCommand('neko.agent.registerSlashCommands', ...)`.
 */
export interface PluginSlashCommandDef {
  id: string;
  name: string;
  description: string;
  icon?: string;
  extensionId: string;
}

/**
 * Skill summary for UI display (from @neko/platform)
 * Duplicated here to avoid direct dependency on platform package
 */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  icon?: string;
  slashCommand?: string;
  tags: string[];
  source: 'builtin' | 'user' | 'project' | 'community';
  enabled: boolean;
}

// Generation params -------------------------------------------------------

export type GenCategory = 'image' | 'video' | 'audio';
export type EntryPromptMenu = 'generate-assets' | 'roleplay';
export type GenerationDuration = 'auto' | number;

export interface GenerationParams {
  ratio: '16:9' | '9:16' | '1:1' | '4:3' | '3:2' | '21:9' | '2.39:1';
  resolution: '512' | '720p' | '1080p' | '2K' | '4K';
  /** Video duration in seconds, or auto for Agent/model inference. */
  videoDuration: GenerationDuration;
  videoFps: 24 | 30;
  /** Audio duration in seconds, or auto for Agent/model inference. */
  audioDuration: GenerationDuration;
  audioType: 'sfx' | 'ambient' | 'voice';
}

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  ratio: '16:9',
  resolution: '1080p',
  videoDuration: 'auto',
  videoFps: 24,
  audioDuration: 'auto',
  audioType: 'sfx',
};

export interface ComposerMenuSelectionState {
  readonly open: boolean;
  readonly filter: string;
  readonly selectedIndex: number;
}

export type AgentConfigCategory = 'llm' | GenCategory;

export type ComposerControlMenuId =
  | 'session-mode'
  | 'agent-config-category'
  | 'agent-model'
  | 'understanding-model'
  | 'media-model'
  | 'generation-ratio'
  | 'generation-resolution'
  | 'generation-duration'
  | 'generation-audio-type'
  | 'llm-reasoning'
  | 'llm-verbosity'
  | 'llm-creativity'
  | 'execution-mode';

export interface ComposerControlMenuState {
  readonly openMenu: ComposerControlMenuId | null;
  readonly agentConfigCategory: AgentConfigCategory;
  readonly understandingCategory: GenCategory | null;
}

export interface ComposerMenuState {
  readonly slash: ComposerMenuSelectionState;
  readonly skill: ComposerMenuSelectionState;
  readonly mention: ComposerMenuSelectionState;
  readonly controls: ComposerControlMenuState;
  readonly queueExpanded: boolean;
}

export const DEFAULT_AGENT_LLM_CONFIG: Readonly<AgentLlmConfig> = {
  reasoningPreset: 'balanced',
  verbosityPreset: 'standard',
  creativityPreset: 'creative',
};

export const DEFAULT_COMPOSER_MENU_STATE: Readonly<ComposerMenuState> = {
  slash: { open: false, filter: '', selectedIndex: 0 },
  skill: { open: false, filter: '', selectedIndex: 0 },
  mention: { open: false, filter: '', selectedIndex: 0 },
  controls: {
    openMenu: null,
    agentConfigCategory: 'llm',
    understandingCategory: null,
  },
  queueExpanded: false,
};

// Project file for @ reference
export interface ProjectFile {
  path: string;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
  source?: 'workspace' | 'media-library' | 'entity-graph' | 'story' | 'canvas';
  mediaType?: 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';
}

// @mention item kinds
export type MentionItemKind =
  'file' | 'canvas-node' | 'character' | 'scene' | 'asset' | 'media' | 'entity';

/**
 * Unified item shown in the @mention popup.
 * Items with filePath become @path reference tokens; other context-backed items create AgentContextChip.
 */
export interface MentionItem {
  /** Stable unique key */
  id: string;
  kind: MentionItemKind;
  /** Display label */
  label: string;
  /** Secondary hint text */
  description?: string;
  /** Path sent as an @ reference when this item is selected. */
  filePath?: string;
  /** Optional icon supplied by host protocol */
  icon?: string;
  /** Source index that produced this candidate */
  source?: ProjectFile['source'];
  /** Media type, when known */
  mediaType?: ProjectFile['mediaType'];
  /** Entity category or graph node kind */
  entityType?: string;
  /** Host-side navigation metadata */
  navigationData?: Record<string, string>;
  /** Host-provided normalized or expanded search text */
  searchText?: string;
  /** For canvas-node / character / scene: payload for AgentContextChip */
  contextPayload?: import('@neko/shared').AgentContextPayload;
  /** Optional thumbnail for visual enrichment (webview-safe URI or base64) */
  thumbnailUri?: string;
}

export interface SelectedFileReference extends AgentFileReference {
  mediaType?: ProjectFile['mediaType'];
  source?: ProjectFile['source'];
}

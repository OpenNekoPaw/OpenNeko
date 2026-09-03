/**
 * InputArea Types and Constants
 */

import type { AgentFileReference } from '@neko/agent-contracts';

export type { AttachmentType, MessageAttachment } from '@neko/agent-contracts';

// Command source type
export type CommandSource = 'builtin' | 'command' | 'plugin';

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
  /** Backing command document id if source is 'command' */
  skillId?: string;
  /** Plugin ID if source is 'plugin'. */
  pluginId?: string;
}

/**
 * Plugin slash command registered by an installed Desktop plugin.
 */
export interface PluginSlashCommandDef {
  id: string;
  name: string;
  description: string;
  icon?: string;
  pluginId: string;
}

/**
 * Skill summary projected by the Agent runtime for UI display.
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
export type MediaModelCategory = GenCategory | 'music';
export type EntryPromptMenu = 'roleplay';
export type CharacterConversationMode =
  import('@neko/agent-contracts').AgentCharacterDialogueLaunchBinding['mode'];
export type MediaModelParameterProfile = NonNullable<
  import('@neko/agent-contracts/dsh-session-host').DshComposerModelOption['parameterProfile']
>;

export interface GenerationParams {
  readonly image: {
    readonly aspectRatio?: string;
    readonly resolution?: number;
    readonly quality?: string;
  };
  readonly video: {
    readonly aspectRatio?: string;
    readonly resolution?: string;
    readonly duration?: number;
    readonly fps?: number;
    readonly generateAudio?: boolean;
  };
  readonly audio: {
    readonly duration?: number;
    readonly audioType?: 'sfx' | 'ambient' | 'voice';
  };
  readonly music: {
    readonly duration?: number;
  };
}

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  image: {},
  video: {},
  audio: {},
  music: {},
};

export interface ComposerMenuSelectionState {
  readonly open: boolean;
  readonly filter: string;
  readonly selectedIndex: number;
}

export type ComposerConfigCategory = 'llm' | MediaModelCategory;
export type ComposerConfigSection = 'model' | 'params';

export type ComposerControlMenuId =
  | 'session-mode'
  | 'composer-config'
  | 'agent-model'
  | 'character-conversation-mode'
  | 'execution-mode';

export interface ComposerControlMenuState {
  readonly openMenu: ComposerControlMenuId | null;
  readonly configCategory: ComposerConfigCategory;
  readonly configSection: ComposerConfigSection;
}

export interface ComposerMenuState {
  readonly slash: ComposerMenuSelectionState;
  readonly skill: ComposerMenuSelectionState;
  readonly mention: ComposerMenuSelectionState;
  readonly controls: ComposerControlMenuState;
  readonly queueExpanded: boolean;
}

export const DEFAULT_COMPOSER_MENU_STATE: Readonly<ComposerMenuState> = {
  slash: { open: false, filter: '', selectedIndex: 0 },
  skill: { open: false, filter: '', selectedIndex: 0 },
  mention: { open: false, filter: '', selectedIndex: 0 },
  controls: {
    openMenu: null,
    configCategory: 'llm',
    configSection: 'model',
  },
  queueExpanded: false,
};

// Project file for @ reference
export interface ProjectFile {
  locator: import('@neko/content-domain').WorkspaceFileContentLocator;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
  source?: 'workspace' | 'media-library' | 'asset-library' | 'entity-graph' | 'story' | 'canvas';
  mediaType?: 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';
}

// @mention item kinds
export type MentionItemKind =
  'file' | 'canvas-node' | 'character' | 'scene' | 'asset' | 'media' | 'entity';

/**
 * Unified item shown in the @mention popup.
 * Items with a content locator become file reference tokens; other context-backed items create AgentContextChip.
 */
export interface MentionItem {
  /** Stable unique key */
  id: string;
  kind: MentionItemKind;
  /** Display label */
  label: string;
  /** Secondary hint text */
  description?: string;
  /** Stable Host-issued content identity used when this item is selected. */
  contentLocator?: import('@neko/content-domain').ContentLocator;
  /** Exact Host identity used only to materialize a selected Asset into the Workspace. */
  assetId?: string;
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
  /** Exact owner selection used only by the unbound Agent Entry. */
  characterLaunchSelection?: {
    readonly globalCharacterId: string;
    readonly characterVersionId: string;
  };
  /** Host-provided normalized or expanded search text */
  searchText?: string;
  /** For canvas-node / character / scene: payload for AgentContextChip */
  contextPayload?: import('@neko/agent-contracts').AgentContextPayload;
  /** Optional thumbnail for visual enrichment (webview-safe URI or base64) */
  thumbnailUri?: string;
}

export interface SelectedCharacterLaunch {
  readonly globalCharacterId: string;
  readonly characterVersionId: string;
  readonly label: string;
}

export interface SelectedWorldLaunch {
  readonly globalWorldId: string;
  readonly worldVersionId: string;
  readonly label: string;
  readonly versionLabel: string;
}

export interface SelectedFileReference extends AgentFileReference {
  mediaType?: ProjectFile['mediaType'];
  source?: ProjectFile['source'];
}

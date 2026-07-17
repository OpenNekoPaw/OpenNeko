import type { Message } from './message';
import type { OpenTab, TabType } from './ui';

export type SlashCommandResultEffect =
  | { type: 'appendAssistantMessage'; message: Message }
  | { type: 'closeCurrentTab' }
  | { type: 'setActiveTab'; activeTab: TabType };

export interface SlashCommandResultProjection {
  effects: SlashCommandResultEffect[];
}

export interface SlashCommandResultProjectionOptions {
  now?: () => number;
}

export interface CloseCurrentConversationTabInput {
  openTabs: readonly OpenTab[];
  activeConversationId: string | null;
}

export interface CloseCurrentConversationTabProjection {
  updated: boolean;
  openTabs: OpenTab[];
  activeTabId: string | null;
  activeConversationId: string | null;
}

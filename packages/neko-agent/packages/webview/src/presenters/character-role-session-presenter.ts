import type { ConversationKind, OpenTab } from '@neko-agent/types';

export type CharacterRoleOpenTab = OpenTab & {
  kind: 'character-dialogue' | 'embody-character';
};

export function isCharacterRoleConversationKind(kind: ConversationKind): boolean {
  return kind === 'character-dialogue' || kind === 'embody-character';
}

export function isCharacterRoleTab(tab: OpenTab | undefined): tab is CharacterRoleOpenTab {
  return tab?.kind === 'character-dialogue' || tab?.kind === 'embody-character';
}

export function findActiveTab(
  openTabs: readonly OpenTab[],
  activeTabId: string | null,
): OpenTab | undefined {
  return activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
}

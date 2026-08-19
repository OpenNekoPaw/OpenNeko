import type { ConversationKind, OpenTab } from '@neko/agent-contracts';

type Translate = (key: string, params?: Record<string, string | number>) => string;

export type CharacterRoleOpenTab = OpenTab & {
  kind: 'character-dialogue' | 'embody-character';
};

const EXACT_FACT_LABEL_KEYS: Readonly<Record<string, string>> = {
  'identity.name': 'characterRole.fact.identityName',
  'identity.displayName': 'characterRole.fact.identityDisplayName',
  'metadata.role': 'characterRole.fact.role',
  'metadata.ageRange': 'characterRole.fact.ageRange',
  'metadata.age': 'characterRole.fact.age',
  'metadata.gender': 'characterRole.fact.gender',
  'metadata.notes': 'characterRole.fact.notes',
  'metadata.personality': 'characterRole.fact.personality',
  'speech.catchphrase': 'characterRole.fact.catchphrase',
  'occurrence.scene': 'characterRole.fact.scene',
  'occurrence.sceneAppearance': 'characterRole.fact.sceneAppearance',
  'dialogue.sample': 'characterRole.fact.dialogueSample',
};

const PREFIX_FACT_LABEL_KEYS: readonly (readonly [prefix: string, labelKey: string])[] = [
  ['relationship.', 'characterRole.fact.relationship'],
  ['representation.', 'characterRole.fact.representation'],
  ['visual.', 'characterRole.fact.visual'],
  ['agent.', 'characterRole.fact.inferred'],
];

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

export function projectCharacterFactLabel(key: string, translate: Translate): string {
  const exactLabelKey = EXACT_FACT_LABEL_KEYS[key];
  if (exactLabelKey) return translate(exactLabelKey);

  const prefixLabelKey = PREFIX_FACT_LABEL_KEYS.find(([prefix]) => key.startsWith(prefix))?.[1];
  return prefixLabelKey
    ? translate(prefixLabelKey)
    : translate('characterRole.fact.unknown', { key });
}

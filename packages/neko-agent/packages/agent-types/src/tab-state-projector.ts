import type { OpenTab, TabState } from './ui';

export interface ResolveActiveTabConversationIdInput {
  readonly tabState: TabState;
  readonly hasConversation: (conversationId: string) => boolean;
  readonly hasCharacterDialogueSession?: (sessionId: string) => boolean;
  readonly hasEmbodyCharacterSession?: (sessionId: string) => boolean;
}

export interface ProjectTabStateUpdateInput {
  readonly openTabs: readonly OpenTab[];
  readonly activeTabId: string | null;
}

export const EMPTY_TAB_STATE: TabState = {
  openTabs: [],
  activeTabId: null,
};

export function normalizeTabState(value: unknown): TabState {
  const record = asRecord(value);
  if (!record) return { ...EMPTY_TAB_STATE };

  const openTabs = Array.isArray(record.openTabs)
    ? record.openTabs.filter(isOpenTab).map(cloneOpenTab)
    : [];
  const activeTabIdValue = record.activeTabId;
  const activeTabId = typeof activeTabIdValue === 'string' ? activeTabIdValue : null;

  return { openTabs, activeTabId };
}

export function projectTabStateUpdate(input: ProjectTabStateUpdateInput): TabState {
  return {
    openTabs: input.openTabs.map(cloneOpenTab),
    activeTabId: input.activeTabId,
  };
}

export function resolveActiveTabConversationId(
  input: ResolveActiveTabConversationIdInput,
): string | null {
  const activeTab = input.tabState.activeTabId
    ? input.tabState.openTabs.find((tab) => tab.id === input.tabState.activeTabId)
    : undefined;

  if (!activeTab) return null;
  if (activeTab.kind === 'character-dialogue') {
    return input.hasCharacterDialogueSession?.(activeTab.conversationId)
      ? activeTab.conversationId
      : null;
  }
  if (activeTab.kind === 'embody-character') {
    return input.hasEmbodyCharacterSession?.(activeTab.conversationId)
      ? activeTab.conversationId
      : null;
  }
  return input.hasConversation(activeTab.conversationId) ? activeTab.conversationId : null;
}

function isOpenTab(value: unknown): value is OpenTab {
  const record = asRecord(value);
  return (
    !!record &&
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.conversationId === 'string' &&
    (record.kind === undefined ||
      record.kind === 'chat' ||
      record.kind === 'character-dialogue' ||
      record.kind === 'embody-character')
  );
}

function cloneOpenTab(tab: OpenTab): OpenTab {
  return {
    id: tab.id,
    title: tab.title,
    conversationId: tab.conversationId,
    ...(tab.kind ? { kind: tab.kind } : {}),
    ...(tab.characterDialogueSession
      ? { characterDialogueSession: tab.characterDialogueSession }
      : {}),
    ...(tab.embodyCharacterSession ? { embodyCharacterSession: tab.embodyCharacterSession } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

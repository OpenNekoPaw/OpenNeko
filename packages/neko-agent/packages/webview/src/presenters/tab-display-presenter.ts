import type {
  AgentState,
  ConversationStreamingState,
  ConversationSummary,
  Message,
  OpenTab,
} from '@neko-agent/types';

export type TabDisplayStatus = 'running' | 'completed';

export type DisplayTab = OpenTab & {
  readonly displayStatus?: TabDisplayStatus;
};

export interface TabRenderStatusSnapshot {
  readonly messages: readonly Message[];
  readonly streaming: Pick<ConversationStreamingState, 'isThinking' | 'streamingMessageId'>;
}

export interface ProjectDisplayTabsInput {
  readonly openTabs: readonly OpenTab[];
  readonly conversations: readonly ConversationSummary[];
  readonly activeConversationId: string | null;
  readonly activeMessages: readonly Message[];
  readonly activeStreaming: ConversationStreamingState;
  readonly messagesByConversation: ReadonlyMap<string, readonly Message[]>;
  readonly streamingByConversation: ReadonlyMap<string, ConversationStreamingState>;
  readonly renderSnapshotsByConversation?: ReadonlyMap<string, TabRenderStatusSnapshot>;
  readonly agentStateByConversation: ReadonlyMap<string, AgentState>;
}

export interface ApplyUserMessageToTabStateInput {
  readonly openTabs: readonly OpenTab[];
  readonly conversations: readonly ConversationSummary[];
  readonly conversationId: string;
  readonly messageContent: string;
  readonly timestamp: number;
}

export interface ApplyUserMessageToTabStateResult {
  readonly openTabs: OpenTab[];
  readonly conversations: ConversationSummary[];
}

const NEW_CHAT_TITLE = 'New Chat';
const TITLE_MAX_LENGTH = 50;

export function projectDisplayTabs(input: ProjectDisplayTabsInput): DisplayTab[] {
  return input.openTabs.map((tab) => {
    const conversationId = tab.conversationId;
    const renderSnapshot = input.renderSnapshotsByConversation?.get(conversationId);
    const messages =
      renderSnapshot?.messages ??
      (conversationId === input.activeConversationId
        ? input.activeMessages
        : (input.messagesByConversation.get(conversationId) ?? []));
    const streaming =
      renderSnapshot?.streaming ??
      (conversationId === input.activeConversationId
        ? input.activeStreaming
        : input.streamingByConversation.get(conversationId));
    const agentState = input.agentStateByConversation.get(conversationId);
    const summary = input.conversations.find((conversation) => conversation.id === conversationId);
    const displayStatus = resolveTabDisplayStatus({
      messageCount: messages.length > 0 ? messages.length : (summary?.messageCount ?? 0),
      streaming,
      agentState,
    });

    const displayTab = cloneDisplayTabWithoutStatus(tab);
    return displayStatus ? { ...displayTab, displayStatus } : displayTab;
  });
}

function cloneDisplayTabWithoutStatus(tab: OpenTab): DisplayTab {
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

export function applyUserMessageToTabState(
  input: ApplyUserMessageToTabStateInput,
): ApplyUserMessageToTabStateResult {
  return {
    openTabs: applyUserMessageToOpenTabs({
      openTabs: input.openTabs,
      conversationId: input.conversationId,
      messageContent: input.messageContent,
    }),
    conversations: applyUserMessageToConversationSummaries({
      conversations: input.conversations,
      conversationId: input.conversationId,
      messageContent: input.messageContent,
      timestamp: input.timestamp,
    }),
  };
}

export function applyUserMessageToOpenTabs(input: {
  readonly openTabs: readonly OpenTab[];
  readonly conversationId: string;
  readonly messageContent: string;
}): OpenTab[] {
  const title = generateConversationTitle(input.messageContent);
  return input.openTabs.map((tab) =>
    tab.conversationId === input.conversationId && shouldReplaceTabTitle(tab.title)
      ? { ...tab, title }
      : tab,
  );
}

export function applyUserMessageToConversationSummaries(input: {
  readonly conversations: readonly ConversationSummary[];
  readonly conversationId: string;
  readonly messageContent: string;
  readonly timestamp: number;
}): ConversationSummary[] {
  const title = generateConversationTitle(input.messageContent);
  return upsertConversationSummary({
    conversations: input.conversations,
    conversationId: input.conversationId,
    title,
    timestamp: input.timestamp,
  });
}

export function generateConversationTitle(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return NEW_CHAT_TITLE;

  let title = trimmed.slice(0, TITLE_MAX_LENGTH).trim();
  if (trimmed.length > TITLE_MAX_LENGTH) {
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 20) {
      title = title.slice(0, lastSpace);
    }
    title += '...';
  }
  return title || NEW_CHAT_TITLE;
}

function resolveTabDisplayStatus(input: {
  readonly messageCount: number;
  readonly streaming?: ConversationStreamingState;
  readonly agentState?: AgentState;
}): TabDisplayStatus | undefined {
  if (input.streaming?.isThinking || input.streaming?.streamingMessageId) {
    return 'running';
  }
  if (input.agentState && input.agentState.phase !== 'idle') {
    return 'running';
  }
  if (input.messageCount > 0) {
    return 'completed';
  }
  return undefined;
}

function shouldReplaceTabTitle(title: string): boolean {
  return title.trim().length === 0 || title === NEW_CHAT_TITLE;
}

function upsertConversationSummary(input: {
  readonly conversations: readonly ConversationSummary[];
  readonly conversationId: string;
  readonly title: string;
  readonly timestamp: number;
}): ConversationSummary[] {
  let updated = false;
  const conversations = input.conversations.map((conversation) => {
    if (conversation.id !== input.conversationId) return conversation;
    updated = true;
    return {
      ...conversation,
      title: shouldReplaceTabTitle(conversation.title) ? input.title : conversation.title,
      messageCount: Math.max(conversation.messageCount + 1, 1),
      updatedAt: input.timestamp,
    };
  });

  if (updated) {
    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return [
    {
      id: input.conversationId,
      title: input.title,
      messageCount: 1,
      updatedAt: input.timestamp,
    },
    ...conversations,
  ];
}

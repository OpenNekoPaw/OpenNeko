import type {
  CloseCurrentConversationTabInput,
  CloseCurrentConversationTabProjection,
  SlashCommandResultEffect,
  SlashCommandResultProjection,
  SlashCommandResultProjectionOptions,
  SlashCommandResultMessage,
} from '@neko-agent/types';

const CHAT_ONLY_ACTIONS = new Set([
  'showSettings',
  'showTasks',
  'showModelSelector',
  'showMCPServers',
  'showPermissions',
]);

const PROJECT_INITIALIZATION_MESSAGE = `**Project Initialization**

To initialize your project, you can:
1. Create a \`.neko/\` directory in your project root
2. Add project skills in \`.agents/skills/\` or personal skills in \`~/.agents/skills/\`
3. Add commands in \`.neko/commands/\` directory
4. Configure hooks in \`.neko/settings.json\`

Or use the Settings panel to configure providers and models.`;

export function projectSlashCommandResultMessage(
  message: SlashCommandResultMessage,
  options: SlashCommandResultProjectionOptions = {},
): SlashCommandResultProjection {
  const effects: SlashCommandResultEffect[] = [];
  const timestamp = options.now?.() ?? Date.now();

  if (!message.success) {
    effects.push(createAssistantMessageEffect(message.error || 'Command failed', timestamp, true));
    return { effects };
  }

  const messageText = message.message ?? '';
  switch (message.action) {
    case 'exit':
      effects.push({ type: 'closeCurrentTab' });
      if (messageText) effects.push(createAssistantMessageEffect(messageText, timestamp));
      break;

    case 'updateExecutionMode':
      if (messageText) effects.push(createAssistantMessageEffect(messageText, timestamp));
      break;

    case 'showStatus':
      if (message.data) {
        effects.push(createAssistantMessageEffect(formatStatusMessage(message.data), timestamp));
      }
      break;

    case 'initProject':
      effects.push(createAssistantMessageEffect(PROJECT_INITIALIZATION_MESSAGE, timestamp));
      break;

    case 'resumeConversation':
      effects.push(
        createAssistantMessageEffect(formatResumeConversationMessage(message.data), timestamp),
      );
      break;

    case 'showHelp':
      break;

    default:
      if (message.action && CHAT_ONLY_ACTIONS.has(message.action)) {
        effects.push({ type: 'setActiveTab', activeTab: 'chat' });
        break;
      }
      if (messageText) effects.push(createAssistantMessageEffect(messageText, timestamp));
      break;
  }

  return { effects };
}

export function projectCloseCurrentConversationTab(
  input: CloseCurrentConversationTabInput,
): CloseCurrentConversationTabProjection {
  if (!input.activeConversationId) {
    return {
      updated: false,
      openTabs: [...input.openTabs],
      activeTabId: null,
      activeConversationId: null,
    };
  }

  const currentTab = input.openTabs.find(
    (tab) => tab.conversationId === input.activeConversationId,
  );
  if (!currentTab) {
    return {
      updated: false,
      openTabs: [...input.openTabs],
      activeTabId: null,
      activeConversationId: input.activeConversationId,
    };
  }

  const tabIndex = input.openTabs.findIndex((tab) => tab.id === currentTab.id);
  const openTabs = input.openTabs.filter((tab) => tab.id !== currentTab.id);
  const newActiveIndex = Math.min(tabIndex, openTabs.length - 1);
  const newActiveTab = newActiveIndex >= 0 ? openTabs[newActiveIndex] : undefined;

  return {
    updated: true,
    openTabs,
    activeTabId: newActiveTab?.id ?? null,
    activeConversationId: newActiveTab?.conversationId ?? null,
  };
}

function createAssistantMessageEffect(
  content: string,
  timestamp: number,
  isError?: boolean,
): SlashCommandResultEffect {
  return {
    type: 'appendAssistantMessage',
    message: {
      id: String(timestamp),
      role: 'assistant',
      content,
      timestamp,
      ...(isError ? { isError: true } : {}),
    },
  };
}

function formatStatusMessage(data: Record<string, unknown>): string {
  return `**Status:**
- Provider: ${readDisplayString(data, 'provider', 'Not set')}
- Model: ${readDisplayString(data, 'model', 'Not set')}
- Conversations: ${readNumber(data, 'conversationCount', 0)}
- Messages in current: ${readNumber(data, 'messageCount', 0)}
- Context tokens: ${readNumber(data, 'tokenCount', 0)}
- Execution mode: ${readDisplayString(data, 'executionMode', 'normal')}`;
}

function formatResumeConversationMessage(data: Record<string, unknown> | undefined): string {
  const conversations = readConversationSummaries(data).slice(0, 5);
  if (conversations.length === 0) {
    return data?.conversations
      ? 'No conversations to resume. Start a new chat!'
      : 'Use the conversation list in the sidebar to resume a previous conversation.';
  }

  const conversationList = conversations
    .map(
      (conversation, index) =>
        `${index + 1}. **${conversation.title}** (${conversation.messageCount} messages)`,
    )
    .join('\n');

  return `**Recent Conversations:**\n${conversationList}\n\nClick on a conversation in the sidebar to resume it.`;
}

function readConversationSummaries(
  data: Record<string, unknown> | undefined,
): Array<{ title: string; messageCount: number }> {
  const raw = data?.conversations;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const title = readString(item, 'title');
      if (!title) return null;
      return {
        title,
        messageCount: readNumber(item, 'messageCount', 0),
      };
    })
    .filter((item): item is { title: string; messageCount: number } => item !== null);
}

function readDisplayString(
  data: Record<string, unknown>,
  key: string,
  defaultValue: string,
): string {
  return readString(data, key) || defaultValue;
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(data: Record<string, unknown>, key: string, defaultValue: number): number {
  const value = data[key];
  return typeof value === 'number' ? value : defaultValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterDialogueSessionProjection, SubAgentWorkItem } from '@neko/agent-contracts';
import { ChatView } from './index';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'OpenNeko Creative Assistant',
  'chat.emptyState.description':
    'Start from an idea, reference, or character and develop story themes, relationships, worlds, and scene atmosphere with the Agent.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.entry.startChat': 'Start Chat',
  'chat.emptyState.entry.generateAssets': 'Generate Assets',
  'chat.emptyState.entry.roleplay': 'Roleplay',
  'chat.conversation.loading': 'Loading conversation history...',
  'chat.workItems.attentionTitle': 'Tasks requiring attention',
};

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? ''),
  }),
}));

vi.mock('./DropZone', () => ({
  DropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./InputArea', () => ({
  InputArea: (props: {
    isComposing?: boolean;
    focusRequestOwner?: string;
    focusRequestTarget?: 'none' | 'input';
    focusRequestId?: string;
  }) => (
    <div data-testid="input-area">
      {String(props.isComposing ?? false)}:{props.focusRequestOwner ?? 'none'}:
      {props.focusRequestTarget ?? 'none'}:{props.focusRequestId ?? 'none'}
    </div>
  ),
}));

vi.mock('./MessageList', () => ({
  MessageList: ({ agentState }: { agentState?: { phase: string; toolName?: string } | null }) => (
    <div data-testid="message-list">
      {agentState ? (
        <div className="agent-execution-activity" role="status">
          {agentState.toolName ?? agentState.phase}
        </div>
      ) : null}
    </div>
  ),
}));

vi.mock('./CharacterDialogueHeader', () => ({
  CharacterDialogueHeader: () => <div data-testid="character-dialogue-header" />,
}));

vi.mock('./EmbodyCharacterHeader', () => ({
  EmbodyCharacterHeader: () => <div data-testid="embody-character-header" />,
}));

describe('ChatView empty state', () => {
  it('keeps an opened empty normal chat blank instead of showing the entry card', () => {
    renderChatView();

    expect(screen.queryByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Start Chat/ })).toBeNull();
    expect(screen.getByTestId('input-area')).toBeTruthy();
  });

  it('renders explicit loading and unavailable states instead of an empty transcript', () => {
    const { rerender } = renderChatView({
      foregroundConversationAvailability: { kind: 'loading' },
    });

    expect(screen.getByRole('status').textContent).toBe('Loading conversation history...');
    expect(screen.queryByTestId('message-list')).toBeNull();

    rerender(
      <ChatView
        messages={[]}
        inputValue=""
        isThinking={false}
        streamingMessageId={null}
        activeConversationId="conv-1"
        foregroundConversationAvailability={{
          kind: 'unavailable',
          diagnostic: 'Activation was rejected.',
        }}
        onInputChange={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toBe('Activation was rejected.');
    expect(screen.queryByTestId('message-list')).toBeNull();
  });

  it('does not render ordinary assistant suggestions in empty Character Dialogue sessions', () => {
    renderChatView({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession(),
    });

    expect(screen.getByTestId('character-dialogue-header')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'OpenNeko Creative Assistant' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Start Chat/ })).toBeNull();
    expect(screen.queryByText('AI responses may be inaccurate.')).toBeNull();
  });

  it('forwards Tab-owned composition and focus requests to the composer', () => {
    renderChatView({
      isComposing: true,
      focusRequestOwner: 'tab-a',
      focusRequestTarget: 'input',
      focusRequestId: 'focus-a',
    });

    expect(screen.getByTestId('input-area').textContent).toContain('true:tab-a:input:focus-a');
  });

  it('renders an owning-domain conversation feed while retaining the Agent composer', () => {
    renderChatView({
      conversationFeed: <div data-testid="room-feed">Room authority message</div>,
    });

    expect(screen.getByTestId('room-feed').textContent).toBe('Room authority message');
    expect(screen.queryByTestId('message-list')).toBeNull();
    expect(screen.getByTestId('input-area')).toBeTruthy();
  });

  it('renders active execution inside the transcript without a composer-adjacent status', () => {
    const { container, rerender } = renderChatView({
      isThinking: true,
      agentState: { phase: 'acting', toolName: 'ReadDocument', startedAt: Date.now() },
    });

    const activity = screen.getByRole('status');
    expect(screen.getByTestId('message-list').contains(activity)).toBe(true);
    expect(activity.textContent).toContain('ReadDocument');
    expect(container.querySelector('.agent-run-status')).toBeNull();

    rerender(
      <ChatView
        messages={[]}
        inputValue=""
        isThinking={false}
        streamingMessageId={null}
        activeConversationId="conv-b"
        agentState={null}
        onInputChange={vi.fn()}
        onSend={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows only unanchored work items that still require attention', () => {
    renderChatView({
      workItems: [
        createSubAgentWorkItem('active-review', 'processing'),
        createSubAgentWorkItem('completed-review', 'completed'),
      ],
    });

    const shelf = screen.getByRole('region', { name: 'Tasks requiring attention' });
    expect(shelf.textContent).toContain('active-review');
    expect(shelf.textContent).not.toContain('completed-review');
  });
});

function renderChatView(overrides: Partial<React.ComponentProps<typeof ChatView>> = {}) {
  return render(
    <ChatView
      messages={[]}
      inputValue=""
      isThinking={false}
      streamingMessageId={null}
      activeConversationId="conv-1"
      onInputChange={vi.fn()}
      onSend={vi.fn()}
      {...overrides}
    />,
  );
}

function createCharacterDialogueSession(): CharacterDialogueSessionProjection {
  return {
    sessionId: 'dialogue-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    mode: 'roleplay',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: [],
      facts: [],
      sparsity: 'partial',
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
  };
}

function createSubAgentWorkItem(
  title: string,
  status: SubAgentWorkItem['status'],
): SubAgentWorkItem {
  const id = `subagent-${title}`;
  return {
    scope: {
      conversationId: 'conv-1',
      runId: 'run-parent',
      parentRunId: 'run-parent',
      childRunId: id,
      childKind: 'subagent',
    },
    id,
    conversationId: 'conv-1',
    kind: 'subagent',
    parentMessageId: null,
    parentToolCallId: null,
    title,
    status,
    progress: status === 'completed' ? 100 : 30,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:01.000Z',
    subAgent: {
      parentAgentId: 'run-parent',
      type: 'reviewer',
    },
  };
}

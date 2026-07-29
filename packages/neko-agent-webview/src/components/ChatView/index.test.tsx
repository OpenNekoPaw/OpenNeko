import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterDialogueSessionProjection } from '@neko-agent/types';
import { ChatView } from './index';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'OpenNeko Creative Assistant',
  'chat.emptyState.description':
    'Start from an idea, reference, or character and develop story themes, relationships, worlds, and scene atmosphere with the Agent.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.entry.startChat': 'Start Chat',
  'chat.emptyState.entry.generateAssets': 'Generate Assets',
  'chat.emptyState.entry.roleplay': 'Roleplay',
  'chat.agentRun.phase.acting': 'Acting',
  'chat.agentRun.actingWithTool': '{phase}: {tool}',
  'chat.agentRun.elapsedLabel': 'Elapsed time for this run',
  'chat.conversation.loading': 'Loading conversation history...',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? ''),
  }),
}));

vi.mock('@/components/ChatView/DropZone', () => ({
  DropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ChatView/InputArea', () => ({
  InputArea: (props: {
    isComposing?: boolean;
    focusRequestOwner?: string;
    focusRequestTarget?: 'none' | 'input';
    focusRequestRevision?: number;
  }) => (
    <div data-testid="input-area">
      {String(props.isComposing ?? false)}:{props.focusRequestOwner ?? 'none'}:
      {props.focusRequestTarget ?? 'none'}:{props.focusRequestRevision ?? 0}
    </div>
  ),
}));

vi.mock('@/components/ChatView/MessageList', () => ({
  MessageList: ({ activeSkillNotice }: { activeSkillNotice?: { skillName: string } | null }) => (
    <div data-testid="message-list">
      {activeSkillNotice ? <span>{activeSkillNotice.skillName}</span> : null}
    </div>
  ),
}));

vi.mock('@/components/ChatView/CharacterDialogueHeader', () => ({
  CharacterDialogueHeader: () => <div data-testid="character-dialogue-header" />,
}));

vi.mock('@/components/ChatView/EmbodyCharacterHeader', () => ({
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
      focusRequestRevision: 2,
    });

    expect(screen.getByTestId('input-area').textContent).toContain('true:tab-a:input:2');
  });

  it('renders the active conversation run status next to the composer', () => {
    renderChatView({
      isThinking: true,
      agentState: { phase: 'acting', toolName: 'ReadDocument', startedAt: Date.now() },
    });

    expect(screen.getByRole('status').textContent).toContain('Acting: ReadDocument');
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

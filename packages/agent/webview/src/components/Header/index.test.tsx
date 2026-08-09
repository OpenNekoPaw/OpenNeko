import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './index';

vi.mock('../AccountBar', () => ({
  AccountBar: () => (
    <button type="button" aria-label="Account">
      Account
    </button>
  ),
}));

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'header.newChat': 'New Chat',
        'header.roleplay': 'Role Session',
        'header.roleplayHint': 'Choose a character',
        'header.roleplaySection': 'Characters',
        'header.roleplayEmpty': 'No playable characters',
        'header.roleplayBadge': 'Character',
        'header.roleplayConfirmBadge': 'Confirm',
        'history.title': 'History',
        'history.recentConversations': 'Recent conversations',
        'history.noConversations': 'No conversations',
      })[key] ?? key,
  }),
}));

describe('Header', () => {
  it('hides all package-owned conversation navigation in Desktop dock', () => {
    render(
      <Header
        tabs={[]}
        activeTabId={null}
        activeView="chat"
        historyConversations={[]}
        activeConversationId={null}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewChat={vi.fn()}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        configuredProviders={[]}
        onOpenOnboarding={vi.fn()}
        showConversationNavigation={false}
      />,
    );

    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('button', { name: 'New Chat' })).toBeNull();
    expect(within(header).queryByRole('button', { name: 'History' })).toBeNull();
    expect(within(header).queryByRole('button', { name: 'Role Session' })).toBeNull();
    expect(within(header).getByRole('button', { name: 'Account' })).toBeTruthy();
  });

  it('keeps Character launch out of the conversation Header', () => {
    render(
      <Header
        tabs={[]}
        activeTabId={null}
        activeView="chat"
        historyConversations={[]}
        activeConversationId={null}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewChat={vi.fn()}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        configuredProviders={[]}
        onOpenOnboarding={vi.fn()}
      />,
    );

    const header = screen.getByRole('banner');
    const actionNames = within(header)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(actionNames).toEqual(['New Chat', 'History', 'Account']);
    expect(within(header).queryByRole('button', { name: 'Role Session' })).toBeNull();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('keeps role selection but hides package-owned conversation navigation in Desktop dock', () => {
    render(
      <Header
        tabs={[]}
        activeTabId={null}
        activeView="chat"
        historyConversations={[]}
        activeConversationId={null}
        roleplayItems={[]}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewChat={vi.fn()}
        onRequestRoleplayItems={vi.fn()}
        onSelectRoleplayItem={vi.fn()}
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
    expect(within(header).getByRole('button', { name: 'Role Session' })).toBeTruthy();
    expect(within(header).getByRole('button', { name: 'Account' })).toBeTruthy();
  });

  it('opens and dismisses the canonical role selector between new chat and history', () => {
    const onRequestRoleplayItems = vi.fn();
    const onSelectRoleplayItem = vi.fn();

    render(
      <Header
        tabs={[]}
        activeTabId={null}
        activeView="chat"
        historyConversations={[]}
        activeConversationId={null}
        roleplayItems={[
          {
            id: 'entity:char-xiaoju',
            kind: 'entity',
            label: 'Xiaoju',
            description: 'Confirmed character',
            entityType: 'character',
          },
          {
            id: 'entity:entity-projection:semantic-ling',
            kind: 'entity',
            label: 'Ling',
            description: 'Character candidate',
            entityType: 'character',
            navigationData: {
              candidateId: 'candidate:auto:character:Ling',
              projectSearchItemId: 'entity-projection:semantic-ling',
            },
          },
          {
            id: 'scene:roof',
            kind: 'entity',
            label: 'Roof',
            entityType: 'scene',
          },
        ]}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewChat={vi.fn()}
        onRequestRoleplayItems={onRequestRoleplayItems}
        onSelectRoleplayItem={onSelectRoleplayItem}
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
    expect(actionNames).toEqual(['New Chat', 'Role Session', 'History', 'Account']);

    const trigger = screen.getByRole('button', { name: 'Role Session' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);

    expect(onRequestRoleplayItems).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('class')).toContain('is-active');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Xiaoju/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Ling/ }).textContent).toContain('Confirm');
    expect(screen.queryByRole('menuitem', { name: /Roof/ })).toBeNull();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onSelectRoleplayItem).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: /Xiaoju/ }));
    expect(onSelectRoleplayItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entity:char-xiaoju' }),
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

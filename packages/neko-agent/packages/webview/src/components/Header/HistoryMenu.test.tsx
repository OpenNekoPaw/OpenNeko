import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryConversationItem } from '@/presenters/history-menu-presenter';
import { HistoryMenu } from './HistoryMenu';

const translations: Record<string, string> = {
  'history.title': 'History',
  'history.search': 'Search conversations',
  'history.results': '{count} results',
  'history.recentConversations': 'Recent conversations',
  'history.noMatching': 'No matching conversations',
  'history.noConversations': 'No conversations',
  'history.messageCount': '{count} messages',
  'history.timeAgo.justNow': 'just now',
  'history.timeAgo.minutes': '{count} minutes ago',
  'history.timeAgo.hours': '{count} hours ago',
  'history.timeAgo.days': '{count} days ago',
  'history.searchHint': 'Search {count} conversations',
  'history.clearSearch': 'Clear search',
  'history.clearClosed': 'Clear closed',
  'history.protectedCount': '{count} protected',
  'history.deleteConversation': 'Delete conversation',
  'history.deleteDisabled.open': 'Close tab before deleting',
  'history.deleteDisabled.running': 'Wait for run to finish',
  'history.status.open': 'Open',
  'history.status.running': 'Running',
  'history.status.completed': 'Completed',
  'history.lifecycle.archive': 'Archive',
  'history.lifecycle.restore': 'Restore',
  'history.lifecycle.delete': 'Delete',
  'history.lifecycle.stop-and-archive': 'Stop and archive',
  'history.lifecycle.stop-and-delete': 'Stop and delete',
  'history.lifecycleDisabled.activeWork': 'Active work is running',
  'history.lifecycleDisabled.noActiveWork': 'No active work',
  'history.lifecycleState.active': 'Active',
  'history.lifecycleState.archived': 'Archived',
  'history.runSummary.workItems': '{count} active items',
  'history.runSummary.runs': '{count} active runs',
  'history.runSummary.idle': 'Idle',
  'history.runStatus.running': 'Running',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const template = translations[key] ?? key;
      if (!params) {
        return template;
      }
      return Object.entries(params).reduce(
        (text, [paramKey, value]) => text.replace(`{${paramKey}}`, String(value)),
        template,
      );
    },
  }),
}));

describe('HistoryMenu', () => {
  it('opens a unified header menu and marks the active conversation', () => {
    const onOpenConversation = vi.fn();

    render(
      <HistoryMenu
        conversations={createConversations()}
        activeConversationId="conv-2"
        onOpenConversation={onOpenConversation}
        onDeleteConversation={vi.fn()}
        onClearClosedConversations={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'History' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('.agent-header-action-caret')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.querySelector('.agent-header-action-caret')).toBeNull();
    expect(screen.getByRole('menu').getAttribute('class')).toContain('agent-header-menu');
    expect(screen.getByRole('menu').getAttribute('class')).toContain('agent-history-menu');
    expect(document.querySelector('.agent-history-menu-search')).toBeTruthy();
    expect(document.querySelector('.agent-history-menu-section')?.textContent).toBe(
      'Recent conversations',
    );

    const activeItem = screen.getByRole('menuitem', { name: /Storyboard/ });
    expect(activeItem.closest('.agent-history-menu-item')?.getAttribute('class')).toContain(
      'is-active',
    );
    expect(activeItem.querySelector('.agent-history-menu-title')?.textContent).toBe('Storyboard');
    expect(activeItem.querySelector('.agent-history-menu-meta')?.textContent).toContain(
      '8 messages',
    );
    expect(activeItem.querySelector('.agent-history-menu-meta')?.textContent).toContain('Open');
    expect(activeItem.querySelector('.agent-history-menu-meta')?.textContent).toContain(
      'Completed',
    );

    fireEvent.click(activeItem);
    expect(onOpenConversation).toHaveBeenCalledWith('conv-2', 'Storyboard');
  });

  it('clears closed conversations from the compact footer action', () => {
    const onClearClosedConversations = vi.fn();

    render(
      <HistoryMenu
        conversations={createManyConversations()}
        activeConversationId={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onClearClosedConversations={onClearClosedConversations}
        clearableConversationCount={11}
        protectedConversationCount={1}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(document.querySelector('.agent-history-menu-footer')).toBeTruthy();
    expect(document.querySelector('.agent-history-menu-footer-hint')?.textContent).toBe(
      '1 protected',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear closed' }));

    expect(onClearClosedConversations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('filters conversations and clears the search query', () => {
    render(
      <HistoryMenu
        conversations={createConversations()}
        activeConversationId={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft' } });

    expect(screen.getByRole('menuitem', { name: /Draft outline/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Storyboard/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('menuitem', { name: /Storyboard/ })).toBeTruthy();
  });

  it('deletes a single conversation from the row action', () => {
    const onDeleteConversation = vi.fn();

    render(
      <HistoryMenu
        conversations={createConversations()}
        activeConversationId={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={onDeleteConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete conversation' })[0]!);

    expect(onDeleteConversation).toHaveBeenCalledWith('conv-1');
    expect(document.querySelector('.agent-history-delete-button svg polyline')).toBeTruthy();
  });

  it('disables row deletion for open or running conversations', () => {
    const onDeleteConversation = vi.fn();

    render(
      <HistoryMenu
        conversations={[
          {
            id: 'conv-open',
            title: 'Open chat',
            messageCount: 2,
            updatedAt: Date.now(),
            isOpen: true,
            isActive: true,
            executionStatus: 'running',
            canDelete: false,
            protectedReason: 'running',
          },
        ]}
        activeConversationId="conv-open"
        onOpenConversation={vi.fn()}
        onDeleteConversation={onDeleteConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    const deleteButton = screen.getByRole('button', { name: 'Wait for run to finish' });

    expect(deleteButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(deleteButton);
    expect(onDeleteConversation).not.toHaveBeenCalled();
  });
});

function createConversations(): HistoryConversationItem[] {
  const now = Date.now();
  return [
    {
      id: 'conv-1',
      title: 'Draft outline',
      messageCount: 4,
      updatedAt: now - 120_000,
      isOpen: false,
      isActive: false,
      executionStatus: 'completed',
      canDelete: true,
    },
    {
      id: 'conv-2',
      title: 'Storyboard',
      messageCount: 8,
      updatedAt: now - 3_600_000,
      isOpen: true,
      isActive: true,
      executionStatus: 'completed',
      canDelete: false,
      protectedReason: 'open',
    },
  ];
}

function createManyConversations(): HistoryConversationItem[] {
  const now = Date.now();
  return Array.from({ length: 12 }, (_, index) => ({
    id: `conv-${index + 1}`,
    title: `Conversation ${index + 1}`,
    messageCount: index + 1,
    updatedAt: now - index * 60_000,
    isOpen: index === 0,
    isActive: false,
    executionStatus: index === 0 ? 'running' : 'completed',
    canDelete: index !== 0,
    ...(index === 0 ? { protectedReason: 'running' as const } : {}),
  }));
}

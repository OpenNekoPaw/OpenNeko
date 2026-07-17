import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpenTab } from '@neko-agent/types';
import { TabBar } from './TabBar';

const translations: Record<string, string> = {
  'header.conversations': 'Conversations',
  'header.closeTab': 'Close tab',
  'header.newChat': 'New Chat',
  'header.tabStatus.running': 'Running',
  'header.tabStatus.completed': 'Completed',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('TabBar', () => {
  it('renders tabs as selectable tabs with separate close controls', () => {
    const onSwitchTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <TabBar
        tabs={createTabs()}
        activeTabId="tab-2"
        activeView="chat"
        onSwitchTab={onSwitchTab}
        onCloseTab={onCloseTab}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: 'Storyboard' });
    expect(activeTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'New Chat' }));
    expect(onSwitchTab).toHaveBeenCalledWith('tab-1');

    fireEvent.click(screen.getAllByRole('button', { name: 'Close tab' })[1]);
    expect(onCloseTab).toHaveBeenCalledWith('tab-2', expect.anything());
  });

  it('renders a placeholder when no tabs are open', () => {
    render(
      <TabBar
        tabs={[]}
        activeTabId={null}
        activeView="chat"
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(screen.getByText('New Chat')).toBeTruthy();
  });

  it('renders tab display status indicators without changing the tab title text', () => {
    render(
      <TabBar
        tabs={[
          { id: 'tab-1', title: 'Draft', conversationId: 'conv-1', displayStatus: 'running' },
          { id: 'tab-2', title: 'Review', conversationId: 'conv-2', displayStatus: 'completed' },
        ]}
        activeTabId="tab-1"
        activeView="chat"
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Draft - Running' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Review - Completed' })).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(document.querySelector('[data-status="running"]')).toBeTruthy();
    expect(document.querySelector('[data-status="completed"]')).toBeTruthy();
  });

  it('keeps tab chrome separate from header action chrome', () => {
    render(
      <TabBar
        tabs={createTabs()}
        activeTabId="tab-1"
        activeView="chat"
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(document.querySelector('.agent-tab-list')).toBeTruthy();
    expect(document.querySelector('.agent-tab-main')).toBeTruthy();
    expect(document.querySelector('.agent-tab-close')).toBeTruthy();
    expect(document.querySelector('.agent-tab-close')?.className).not.toContain(
      'agent-header-action',
    );
  });
});

function createTabs(): OpenTab[] {
  return [
    {
      id: 'tab-1',
      title: 'New Chat',
      conversationId: 'conv-1',
    },
    {
      id: 'tab-2',
      title: 'Storyboard',
      conversationId: 'conv-2',
    },
  ];
}

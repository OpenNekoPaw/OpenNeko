import type { TabType } from '@neko/agent-contracts';
import { TabBar } from './TabBar';
import { HistoryMenu } from './HistoryMenu';
import { useTranslation } from '../../i18n/I18nContext';
import { AccountBar } from '../AccountBar';
import type { ConfiguredProvider } from '@neko/agent-contracts';
import { PlusIcon } from '@neko/ui/icons';
import type { DisplayTab } from '../../presenters/tab-display-presenter';
import type { HistoryConversationItem } from '../../presenters/history-menu-presenter';
import type { MentionItem } from '../ChatView/InputArea/types';
import { RoleplayMenu } from './RoleplayMenu';

interface HeaderProps {
  tabs: DisplayTab[];
  activeTabId: string | null;
  activeView: TabType;
  historyConversations: HistoryConversationItem[];
  activeConversationId: string | null;
  roleplayItems: readonly MentionItem[];
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  onNewChat: () => void;
  onRequestRoleplayItems: () => void;
  onSelectRoleplayItem: (item: MentionItem) => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearClosedConversations?: () => void;
  clearableConversationCount?: number;
  protectedConversationCount?: number;
  // AccountBar props (replaces settings gear)
  configuredProviders: ConfiguredProvider[];
  onOpenOnboarding: () => void;
  showAccountBar?: boolean;
}

export function Header({
  tabs,
  activeTabId,
  activeView,
  historyConversations,
  activeConversationId,
  roleplayItems,
  onSwitchTab,
  onCloseTab,
  onNewChat,
  onRequestRoleplayItems,
  onSelectRoleplayItem,
  onOpenConversation,
  onDeleteConversation,
  onClearClosedConversations,
  clearableConversationCount,
  protectedConversationCount,
  configuredProviders,
  onOpenOnboarding,
  showAccountBar = true,
}: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="agent-header flex flex-shrink-0 items-center justify-between gap-2 px-2 py-1">
      {/* Left: Tabs */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        activeView={activeView}
        onSwitchTab={onSwitchTab}
        onCloseTab={onCloseTab}
      />

      {/* Right: Action buttons */}
      <div className="agent-header-actions flex items-center gap-0.5 flex-shrink-0">
        {/* + New button */}
        <button
          type="button"
          onClick={onNewChat}
          className="agent-header-action"
          aria-label={t('header.newChat')}
          title={t('header.newChat')}
        >
          <PlusIcon className="w-4 h-4" />
        </button>

        <RoleplayMenu
          items={roleplayItems}
          onRequestItems={onRequestRoleplayItems}
          onSelectItem={onSelectRoleplayItem}
        />

        {/* History dropdown */}
        <HistoryMenu
          conversations={historyConversations}
          activeConversationId={activeConversationId}
          onOpenConversation={onOpenConversation}
          onDeleteConversation={onDeleteConversation}
          onClearClosedConversations={onClearClosedConversations}
          clearableConversationCount={clearableConversationCount}
          protectedConversationCount={protectedConversationCount}
        />

        {showAccountBar ? (
          <AccountBar
            configuredProviders={configuredProviders}
            onOpenOnboarding={onOpenOnboarding}
          />
        ) : null}
      </div>
    </header>
  );
}

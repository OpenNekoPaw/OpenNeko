import type { TabType } from '@neko-agent/types';
import { TabBar } from '@/components/Header/TabBar';
import { HistoryMenu } from '@/components/Header/HistoryMenu';
import { useTranslation } from '@/i18n/I18nContext';
import { AccountBar } from '@/components/AccountBar';
import type { SsoSession, ConfiguredProvider } from '@neko-agent/types';
import { PlusIcon } from '@neko/shared/icons';
import type { DisplayTab } from '@/presenters/tab-display-presenter';
import type { HistoryConversationItem } from '@/presenters/history-menu-presenter';

interface HeaderProps {
  tabs: DisplayTab[];
  activeTabId: string | null;
  activeView: TabType;
  historyConversations: HistoryConversationItem[];
  activeConversationId: string | null;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearClosedConversations?: () => void;
  clearableConversationCount?: number;
  protectedConversationCount?: number;
  // AccountBar props (replaces settings gear)
  ssoSession: SsoSession | null;
  configuredProviders: ConfiguredProvider[];
  onOpenOnboarding: () => void;
}

export function Header({
  tabs,
  activeTabId,
  activeView,
  historyConversations,
  activeConversationId,
  onSwitchTab,
  onCloseTab,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
  onClearClosedConversations,
  clearableConversationCount,
  protectedConversationCount,
  ssoSession,
  configuredProviders,
  onOpenOnboarding,
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

        {/* AccountBar — replaces settings gear */}
        <AccountBar
          ssoSession={ssoSession}
          configuredProviders={configuredProviders}
          onOpenOnboarding={onOpenOnboarding}
        />
      </div>
    </header>
  );
}

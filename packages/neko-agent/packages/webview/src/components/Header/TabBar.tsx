import type { TabType } from '@neko-agent/types';
import { useTranslation } from '@/i18n/I18nContext';
import { CloseIcon } from '@neko/shared/icons';
import type { DisplayTab, TabDisplayStatus } from '@/presenters/tab-display-presenter';

interface TabBarProps {
  tabs: DisplayTab[];
  activeTabId: string | null;
  activeView: TabType;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
}

export function TabBar({ tabs, activeTabId, activeView, onSwitchTab, onCloseTab }: TabBarProps) {
  const { t } = useTranslation();
  return (
    <div
      className="agent-tab-list flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0 scrollbar-tab"
      role="tablist"
      aria-label={t('header.conversations')}
    >
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id && activeView === 'chat';
        const statusLabel = tab.displayStatus ? getStatusLabel(t, tab.displayStatus) : null;

        return (
          <div
            key={tab.id}
            className={`agent-tab group text-[11px] ${isActive ? 'agent-tab-active' : ''}`}
            title={tab.title}
            data-active={isActive ? 'true' : 'false'}
          >
            <button
              type="button"
              onClick={() => onSwitchTab(tab.id)}
              className="agent-tab-main"
              role="tab"
              aria-selected={isActive}
              aria-label={statusLabel ? `${tab.title} - ${statusLabel}` : tab.title}
            >
              <span className="agent-tab-title truncate">{tab.title}</span>
              {tab.displayStatus && statusLabel ? (
                <span
                  className={`agent-tab-status agent-tab-status-${tab.displayStatus}`}
                  data-status={tab.displayStatus}
                  title={statusLabel}
                  aria-hidden="true"
                >
                  <span className="agent-tab-status-dot" />
                  <span className="agent-tab-status-label">{statusLabel}</span>
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label={t('header.closeTab')}
              title={t('header.closeTab')}
              onClick={(event) => onCloseTab(tab.id, event)}
              className="agent-tab-close opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex-shrink-0"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      {tabs.length === 0 && (
        <div className="agent-tab-placeholder px-2 py-1 text-[11px] text-[var(--agent-fg-secondary)]">
          {t('header.newChat')}
        </div>
      )}
    </div>
  );
}

function getStatusLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  status: TabDisplayStatus,
): string {
  return status === 'running' ? t('header.tabStatus.running') : t('header.tabStatus.completed');
}

import { useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { ClockIcon, CloseIcon, SearchIcon, TrashIcon } from '@neko/shared/icons';
import type { HistoryConversationItem } from '@/presenters/history-menu-presenter';

interface HistoryMenuProps {
  conversations: HistoryConversationItem[];
  activeConversationId: string | null;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearClosedConversations?: () => void;
  clearableConversationCount?: number;
  protectedConversationCount?: number;
}

// Format relative time
function formatRelativeTime(
  timestamp: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('history.timeAgo.justNow');
  if (minutes < 60) return t('history.timeAgo.minutes', { count: minutes });
  if (hours < 24) return t('history.timeAgo.hours', { count: hours });
  if (days < 7) return t('history.timeAgo.days', { count: days });
  return new Date(timestamp).toLocaleDateString();
}

export function HistoryMenu({
  conversations,
  activeConversationId,
  onOpenConversation,
  onDeleteConversation,
  onClearClosedConversations,
  clearableConversationCount,
  protectedConversationCount = 0,
}: HistoryMenuProps) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when menu opens
  useEffect(() => {
    if (showMenu) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showMenu]);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations.slice(0, 10);
    }
    const query = searchQuery.toLowerCase();
    return conversations
      .filter((conv) => getSearchableConversationText(conv).includes(query))
      .slice(0, 20);
  }, [conversations, searchQuery]);
  const resolvedClearableConversationCount =
    clearableConversationCount ?? conversations.filter((conv) => conv.canDelete).length;

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMenu(false);
      setSearchQuery('');
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={`agent-header-action agent-header-action-history ${showMenu ? 'is-active' : ''}`}
        title={t('history.title')}
        aria-label={t('history.title')}
        aria-haspopup="menu"
        aria-expanded={showMenu}
      >
        <ClockIcon className="w-4 h-4" />
      </button>

      {showMenu && (
        <div
          className="agent-header-menu agent-history-menu absolute right-0 top-full z-50 mt-1 flex flex-col"
          onKeyDown={handleKeyDown}
          role="menu"
        >
          <div className="agent-header-menu-search agent-history-menu-search">
            <div className="agent-search-shell agent-history-search-shell">
              <SearchIcon className="h-3.5 w-3.5 text-[var(--agent-fg-secondary)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('history.search')}
                className="agent-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="agent-menu-icon-button agent-history-search-clear"
                  aria-label={t('history.clearSearch')}
                  title={t('history.clearSearch')}
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="agent-menu-section agent-history-menu-section">
            {searchQuery
              ? t('history.results', { count: filteredConversations.length })
              : t('history.recentConversations')}
          </div>

          <div className="agent-history-menu-list">
            {filteredConversations.length === 0 ? (
              <div className="agent-history-menu-empty">
                {searchQuery ? t('history.noMatching') : t('history.noConversations')}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`agent-header-menu-item agent-history-menu-item group ${
                    conv.id === activeConversationId ? 'is-active' : ''
                  }`}
                  role="none"
                >
                  <button
                    type="button"
                    className="agent-header-menu-item-main"
                    onClick={() => {
                      onOpenConversation(conv.id, conv.title);
                      setShowMenu(false);
                      setSearchQuery('');
                    }}
                    role="menuitem"
                  >
                    <div className="agent-history-menu-title">{conv.title}</div>
                    <div className="agent-history-menu-meta">
                      <span>{t('history.messageCount', { count: conv.messageCount })}</span>
                      <span aria-hidden="true">•</span>
                      <span>{formatRelativeTime(conv.updatedAt, t)}</span>
                      {conv.isOpen && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>{t('history.status.open')}</span>
                        </>
                      )}
                      {conv.executionStatus && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span
                            className={`agent-history-menu-status agent-history-menu-status-${conv.executionStatus}`}
                          >
                            {t(`history.status.${conv.executionStatus}`)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!conv.canDelete) return;
                      onDeleteConversation(conv.id);
                    }}
                    className="agent-menu-icon-button agent-history-delete-button flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={!conv.canDelete}
                    title={resolveDeleteTitle(conv, t)}
                    aria-label={resolveDeleteTitle(conv, t)}
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {conversations.length > 0 && (
            <div className="agent-header-menu-footer agent-history-menu-footer">
              <span className="agent-history-menu-footer-hint">
                {protectedConversationCount > 0
                  ? t('history.protectedCount', { count: protectedConversationCount })
                  : conversations.length > 10 && !searchQuery
                    ? t('history.searchHint', { count: conversations.length })
                    : ''}
              </span>
              {onClearClosedConversations && (
                <button
                  type="button"
                  onClick={() => {
                    onClearClosedConversations();
                    setShowMenu(false);
                    setSearchQuery('');
                  }}
                  disabled={resolvedClearableConversationCount === 0}
                  className="agent-danger-link agent-history-clear-button"
                  title={t('history.clearClosed')}
                >
                  {t('history.clearClosed')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function resolveDeleteTitle(
  conv: HistoryConversationItem,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (conv.canDelete) return t('history.deleteConversation');
  if (conv.protectedReason === 'running') return t('history.deleteDisabled.running');
  return t('history.deleteDisabled.open');
}

function getSearchableConversationText(conv: HistoryConversationItem): string {
  return conv.title.toLowerCase();
}

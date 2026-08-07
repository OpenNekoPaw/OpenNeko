import { useTranslation } from '../../i18n/I18nContext';
export type EmptyStateEntryAction = 'start-chat' | 'generate-assets' | 'roleplay';

interface EmptyStateProps {
  selectedAction?: EmptyStateEntryAction;
  disabled?: boolean;
  onEntryAction?: (action: EmptyStateEntryAction) => void;
  presentation?: 'default' | 'desktop-dock';
  draftScope?: 'unbound' | 'assistant' | 'workspace';
}

const EMPTY_STATE_ENTRIES: readonly {
  action: EmptyStateEntryAction;
  labelKey: string;
  helperKey: string;
}[] = [
  {
    action: 'start-chat',
    labelKey: 'chat.emptyState.entry.startChat',
    helperKey: 'chat.emptyState.entry.startChatHelper',
  },
  {
    action: 'generate-assets',
    labelKey: 'chat.emptyState.entry.generateAssets',
    helperKey: 'chat.emptyState.entry.generateAssetsHelper',
  },
  {
    action: 'roleplay',
    labelKey: 'chat.emptyState.entry.roleplay',
    helperKey: 'chat.emptyState.entry.roleplayHelper',
  },
];

export function EmptyState({
  selectedAction = 'start-chat',
  disabled = false,
  onEntryAction,
  presentation = 'default',
  draftScope,
}: EmptyStateProps) {
  const { t } = useTranslation();
  const entries = EMPTY_STATE_ENTRIES;
  const selectedEntry = entries.find((entry) => entry.action === selectedAction);
  const draftPresentation = draftScope !== undefined;

  if (presentation === 'desktop-dock') {
    return (
      <div className="agent-empty-state agent-empty-state--desktop-dock flex min-h-0 flex-none select-none items-center justify-center px-3 pb-4 text-center">
        <section
          className="agent-empty-panel w-full min-w-0"
          aria-labelledby="neko-agent-empty-title"
        >
          <h2
            id="neko-agent-empty-title"
            className="agent-empty-title text-[15px] font-semibold leading-6 text-[var(--agent-fg)]"
          >
            {t(
              draftScope === 'assistant'
                ? 'chat.emptyState.scope.assistantActiveTitle'
                : draftScope === 'workspace'
                  ? 'chat.emptyState.scope.workspaceActiveTitle'
                  : 'chat.emptyState.desktopDockTitle',
            )}
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--agent-empty-muted)]">
            {t(
              draftPresentation
                ? 'chat.emptyState.scope.activeDescription'
                : 'chat.emptyState.desktopDockDescription',
            )}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="agent-empty-state flex min-h-0 flex-1 select-none items-center justify-center overflow-y-auto px-3 py-5 sm:px-4 sm:py-7">
      <section
        className="agent-empty-panel w-full min-w-0 max-w-[min(920px,100%)]"
        aria-labelledby="neko-agent-empty-title"
      >
        <div className="min-w-0">
          <h2
            id="neko-agent-empty-title"
            className="agent-empty-title text-[13px] font-semibold leading-5 text-[var(--agent-fg)]"
          >
            {t('chat.emptyState.title')}
          </h2>
          <p className="agent-empty-copy mt-1 max-w-full text-[12px] leading-5 text-[var(--agent-empty-copy)]">
            {t('chat.emptyState.description')}
          </p>
        </div>

        {draftPresentation ? null : (
          <div className="agent-empty-actions mt-5 grid grid-cols-1 gap-1.5">
            {entries.map((entry) => (
              <button
                key={entry.action}
                type="button"
                onClick={() => onEntryAction?.(entry.action)}
                disabled={disabled}
                className={`agent-empty-action group flex min-h-9 w-full min-w-0 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-center text-[12px] leading-5 text-[var(--agent-fg)] transition-colors hover:border-[var(--agent-empty-action-hover-border)] hover:bg-[var(--agent-empty-action-hover-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-accent)] disabled:cursor-default disabled:opacity-60 ${
                  selectedAction === entry.action
                    ? 'agent-empty-action-selected border-[var(--agent-empty-action-hover-border)]'
                    : 'border-[var(--agent-empty-action-border)] bg-[var(--agent-empty-action-bg)]'
                }`}
                aria-pressed={selectedAction === entry.action}
              >
                <span className="min-w-0 flex-1 break-words text-center">{t(entry.labelKey)}</span>
              </button>
            ))}
          </div>
        )}

        <p className="agent-empty-mode-hint mt-3 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
          {selectedEntry ? t(selectedEntry.helperKey) : null}
        </p>

        <p className="agent-empty-disclaimer mt-4 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
          {t('chat.emptyState.disclaimer')}
        </p>
      </section>
    </div>
  );
}

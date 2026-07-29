import type { EmbodyCharacterSessionProjection } from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import { useTranslation } from '@/i18n/I18nContext';

interface EmbodyCharacterHeaderProps {
  session: EmbodyCharacterSessionProjection;
}

export function EmbodyCharacterHeader({ session }: EmbodyCharacterHeaderProps) {
  const { t } = useTranslation();
  const active = session.status === 'active';

  return (
    <div className="border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--vscode-foreground)]">
              {session.displayName}
            </span>
            <span className="rounded-sm border border-[var(--vscode-panel-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-normal text-[var(--vscode-descriptionForeground)]">
              {t('characterRole.embody.mode')}
            </span>
            <span className="rounded-sm border border-[var(--vscode-panel-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-normal text-[var(--vscode-descriptionForeground)]">
              {t(`characterRole.embody.status.${session.status}`)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--vscode-descriptionForeground)]">
            {t('characterRole.embody.description')}
          </div>
        </div>
        {active ? (
          <button
            type="button"
            onClick={() => AgentHostMessages.exitEmbodyCharacterSession(session.sessionId)}
            className="rounded px-2 py-1 text-[11px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            {t('characterRole.action.exit')}
          </button>
        ) : null}
      </div>
      <div className="border-t border-[var(--vscode-panel-border)] px-3 py-2 text-[11px] text-[var(--vscode-descriptionForeground)]">
        <div className="truncate">
          {t('characterRole.embody.scope', { scope: session.scopeSummary.join('; ') })}
        </div>
        {session.prompt ? (
          <div className="mt-1 truncate">
            {t('characterRole.embody.note', { note: session.prompt })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

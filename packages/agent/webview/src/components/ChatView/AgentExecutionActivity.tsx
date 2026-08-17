import { useEffect, useState } from 'react';
import type { AgentState } from '@neko/agent-contracts';
import { useTranslation } from '../../i18n/I18nContext';
import { ToolLoadingSpinner } from './ToolCallDisplay';

interface AgentExecutionActivityProps {
  readonly agentState: AgentState;
}

export function AgentExecutionActivity({ agentState }: AgentExecutionActivityProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, [agentState.startedAt]);

  const visibleLabel =
    agentState.phase === 'acting' && agentState.toolName
      ? agentState.toolName
      : t('chat.agentRun.activity');

  return (
    <div
      className="agent-execution-activity agent-message-row px-3 py-1.5"
      role="status"
      aria-live="polite"
      aria-label={t('chat.agentRun.activityLabel')}
      data-phase={agentState.phase}
      data-started-at={agentState.startedAt}
    >
      <div className="flex min-w-0 items-center gap-2 pl-7 text-[11px] text-[var(--agent-fg-secondary,var(--neko-descriptionForeground))]">
        <ToolLoadingSpinner className="h-3 w-3 shrink-0 text-[var(--agent-info,var(--neko-textLink-foreground))]" />
        <span className="min-w-0 truncate">{visibleLabel}</span>
        <span className="agent-execution-elapsed shrink-0 opacity-70" aria-hidden="true">
          {formatElapsedTime(agentState.startedAt, now)}
        </span>
      </div>
    </div>
  );
}

export function formatElapsedTime(startedAt: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  return `${minutes}m ${elapsedSeconds % 60}s`;
}

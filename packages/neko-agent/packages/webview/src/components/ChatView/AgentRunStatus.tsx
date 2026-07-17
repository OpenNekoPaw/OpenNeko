import { useEffect, useState } from 'react';
import type { AgentPhase, AgentState } from '@neko-agent/types';
import { useTranslation } from '@/i18n/I18nContext';

interface AgentRunStatusProps {
  readonly agentState: AgentState | null;
}

const phaseTone: Record<AgentPhase, string> = {
  idle: 'text-[var(--vscode-descriptionForeground)]',
  thinking: 'text-[var(--vscode-charts-purple)]',
  acting: 'text-[var(--vscode-charts-blue)]',
  streaming: 'text-[var(--vscode-charts-green)]',
};

export function AgentRunStatus({ agentState }: AgentRunStatusProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const startedAt = agentState?.startedAt;

  useEffect(() => {
    if (startedAt === undefined) return;
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (!agentState || agentState.phase === 'idle') return null;

  const activeStartedAt = agentState.startedAt;
  const phaseLabel = t(`chat.agentRun.phase.${agentState.phase}`);
  const statusLabel =
    agentState.phase === 'acting' && agentState.toolName
      ? t('chat.agentRun.actingWithTool', { phase: phaseLabel, tool: agentState.toolName })
      : phaseLabel;

  return (
    <div
      className="agent-run-status flex items-center gap-2 border-t border-[var(--vscode-panel-border)] px-3 py-1.5 text-xs"
      role="status"
      aria-live="polite"
      data-started-at={activeStartedAt}
    >
      <span className={`animate-pulse ${phaseTone[agentState.phase]}`} aria-hidden="true">
        ●
      </span>
      <span className="text-[var(--vscode-foreground)] opacity-80">{statusLabel}</span>
      <span
        className="agent-run-elapsed text-[var(--vscode-descriptionForeground)] opacity-70"
        aria-label={t('chat.agentRun.elapsedLabel')}
      >
        {formatElapsedTime(activeStartedAt, now)}
      </span>
    </div>
  );
}

export function formatElapsedTime(startedAt: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  return `${minutes}m ${elapsedSeconds % 60}s`;
}

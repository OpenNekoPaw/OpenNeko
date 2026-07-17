import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunStatus, formatElapsedTime } from './AgentRunStatus';

const translations: Record<string, string> = {
  'chat.agentRun.phase.thinking': 'Thinking',
  'chat.agentRun.phase.acting': 'Acting',
  'chat.agentRun.phase.streaming': 'Writing',
  'chat.agentRun.actingWithTool': '{phase}: {tool}',
  'chat.agentRun.elapsedLabel': 'Elapsed time for this run',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? ''),
  }),
}));

describe('AgentRunStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('switches the elapsed baseline immediately when the active snapshot changes', () => {
    const { rerender } = render(
      <AgentRunStatus agentState={{ phase: 'thinking', startedAt: 1_000 }} />,
    );

    expect(screen.getByLabelText('Elapsed time for this run').textContent).toBe('9s');

    rerender(
      <AgentRunStatus agentState={{ phase: 'acting', toolName: 'ReadFile', startedAt: 8_000 }} />,
    );

    expect(screen.getByRole('status').textContent).toContain('Acting: ReadFile');
    expect(screen.getByLabelText('Elapsed time for this run').textContent).toBe('2s');
  });

  it('ticks elapsed time locally without mutating the conversation snapshot', () => {
    const agentState = { phase: 'streaming' as const, startedAt: 8_000 };
    render(<AgentRunStatus agentState={agentState} />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByLabelText('Elapsed time for this run').textContent).toBe('4s');
    expect(agentState).toEqual({ phase: 'streaming', startedAt: 8_000 });
  });

  it('formats minute-scale durations and clamps future baselines', () => {
    expect(formatElapsedTime(0, 65_000)).toBe('1m 5s');
    expect(formatElapsedTime(11_000, 10_000)).toBe('0s');
  });
});

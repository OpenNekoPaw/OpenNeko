import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentExecutionActivity, formatElapsedTime } from './AgentExecutionActivity';

const translations: Record<string, string> = {
  'chat.agentRun.activity': 'Working',
  'chat.agentRun.activityLabel': 'Agent execution in progress',
};

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('AgentExecutionActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a compact transcript activity without a thinking label', () => {
    render(<AgentExecutionActivity agentState={{ phase: 'thinking', startedAt: 1_000 }} />);

    const activity = screen.getByRole('status', { name: 'Agent execution in progress' });
    expect(activity.classList.contains('agent-execution-activity')).toBe(true);
    expect(activity.textContent).toContain('Working');
    expect(activity.textContent).toContain('9s');
    expect(activity.textContent).not.toContain('Thinking');
  });

  it('shows the authoritative tool identity until its transcript record arrives', () => {
    render(
      <AgentExecutionActivity
        agentState={{ phase: 'acting', toolName: 'ReadDocument', startedAt: 8_000 }}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('ReadDocument');
  });

  it('ticks elapsed time locally without mutating the state snapshot', () => {
    const agentState = { phase: 'thinking' as const, startedAt: 8_000 };
    render(<AgentExecutionActivity agentState={agentState} />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole('status').textContent).toContain('4s');
    expect(agentState).toEqual({ phase: 'thinking', startedAt: 8_000 });
  });

  it('formats minute-scale durations and clamps future baselines', () => {
    expect(formatElapsedTime(0, 65_000)).toBe('1m 5s');
    expect(formatElapsedTime(11_000, 10_000)).toBe('0s');
  });
});

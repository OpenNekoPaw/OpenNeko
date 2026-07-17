import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testUIStore as useUIStore } from '../../__tests__/test-runtime';
import { SharedTuiTestRuntimeProvider } from '../../__tests__/test-runtime';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY } from '../../markdown/resource-policy';
import {
  subscribeTerminalMarkdownPathEvents,
  type TerminalMarkdownPathEvent,
} from '../../markdown/path-observer';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import {
  CanonicalMarkdownRenderer as CanonicalMarkdownRendererImpl,
  type CanonicalMarkdownRendererProps,
} from './CanonicalMarkdownRenderer';

const TEST_PRESENTATION = createTestAgentTerminalPresentation('en');

function CanonicalMarkdownRenderer(props: CanonicalMarkdownRendererProps): React.JSX.Element {
  return (
    <SharedTuiTestRuntimeProvider>
      <AgentTerminalPresentationProvider value={TEST_PRESENTATION}>
        <CanonicalMarkdownRendererImpl {...props} />
      </AgentTerminalPresentationProvider>
    </SharedTuiTestRuntimeProvider>
  );
}

const originalNoColor = process.env.NO_COLOR;
afterEach(() => {
  vi.useRealTimers();
  if (originalNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalNoColor;
});

describe('CanonicalMarkdownRenderer', () => {
  it('keeps one session from first delta through same-session finalization', async () => {
    vi.useFakeTimers();
    process.env.NO_COLOR = '1';
    useUIStore.getState().setTerminalSize({ columns: 40, rows: 20 });
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const view = render(
      <CanonicalMarkdownRenderer sessionKey="message-1" source="**hel" isFinal={false} />,
    );
    expect(view.lastFrame()).toContain('hel');
    view.rerender(
      <CanonicalMarkdownRenderer sessionKey="message-1" source="**hello**" isFinal={false} />,
    );
    expect(view.lastFrame()).toContain('hel');
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);
    expect(view.lastFrame()).toContain('hello');
    view.rerender(
      <CanonicalMarkdownRenderer sessionKey="message-1" source="**hello**" isFinal={true} />,
    );
    expect(view.lastFrame()).toContain('hello');
    unsubscribe();
    vi.useRealTimers();

    expect(events.filter((event) => event.type === 'session-created')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'source-updated')).toHaveLength(3);
    expect(events.some((event) => event.type === 'session-finalized')).toBe(true);
    const revisions = events
      .filter(
        (event): event is Extract<TerminalMarkdownPathEvent, { type: 'document-projected' }> =>
          event.type === 'document-projected',
      )
      .map((event) => event.revision);
    expect(revisions).toEqual([1, 2, 3]);
  });

  it('reflows on resize without creating a new parse revision', async () => {
    vi.useFakeTimers();
    process.env.NO_COLOR = '1';
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    useUIStore.getState().setTerminalSize({ columns: 30, rows: 20 });
    const view = render(
      <CanonicalMarkdownRenderer
        sessionKey="message-2"
        source="long long long long"
        isFinal={true}
      />,
    );
    useUIStore.getState().setTerminalSize({ columns: 8, rows: 20 });
    view.rerender(
      <CanonicalMarkdownRenderer
        sessionKey="message-2"
        source="long long long long"
        isFinal={true}
      />,
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);
    unsubscribe();
    vi.useRealTimers();

    expect(events.filter((event) => event.type === 'session-created')).toHaveLength(1);
    const projected = events.filter(
      (event): event is Extract<TerminalMarkdownPathEvent, { type: 'document-projected' }> =>
        event.type === 'document-projected' && event.key === 'message-2',
    );
    expect(new Set(projected.map((event) => event.revision))).toEqual(new Set([1]));
    const widths = events
      .filter(
        (event): event is Extract<TerminalMarkdownPathEvent, { type: 'layout-created' }> =>
          event.type === 'layout-created' && event.key === 'message-2',
      )
      .map((event) => event.viewportWidth);
    expect(widths[0]).toBe(30);
    expect(widths.at(-1)).toBe(8);
  });

  it('fails visibly instead of resetting to a final-only or raw-text renderer', () => {
    process.env.NO_COLOR = '1';
    const view = render(
      <CanonicalMarkdownRenderer sessionKey="message-3" source="append only" isFinal={false} />,
    );
    view.rerender(
      <CanonicalMarkdownRenderer sessionKey="message-3" source="replacement" isFinal={false} />,
    );
    expect(view.lastFrame()).toContain('Markdown rendering failed');
  });
});

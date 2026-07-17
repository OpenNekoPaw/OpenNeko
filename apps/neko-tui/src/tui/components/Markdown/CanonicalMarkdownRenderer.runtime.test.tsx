import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  subscribeTerminalMarkdownPathEvents,
  type TerminalMarkdownPathEvent,
} from '../../markdown/path-observer';
import { testUIStore as useUIStore } from '../../__tests__/test-runtime';
import { SharedTuiTestRuntimeProvider } from '../../__tests__/test-runtime';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY } from '../../markdown/resource-policy';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import {
  CanonicalMarkdownRenderer as CanonicalMarkdownRendererImpl,
  type CanonicalMarkdownRendererProps,
} from './CanonicalMarkdownRenderer';

const originalStdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
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

const originalEnv = {
  NO_COLOR: process.env.NO_COLOR,
  FORCE_COLOR: process.env.FORCE_COLOR,
  TERM: process.env.TERM,
  TERM_PROGRAM: process.env.TERM_PROGRAM,
};

afterEach(() => {
  restoreEnv('NO_COLOR', originalEnv.NO_COLOR);
  restoreEnv('FORCE_COLOR', originalEnv.FORCE_COLOR);
  restoreEnv('TERM', originalEnv.TERM);
  restoreEnv('TERM_PROGRAM', originalEnv.TERM_PROGRAM);
  if (originalStdoutTty === undefined) delete (process.stdout as { isTTY?: boolean }).isTTY;
  else Object.defineProperty(process.stdout, 'isTTY', originalStdoutTty);
  vi.useRealTimers();
});

describe.sequential('CanonicalMarkdownRenderer focused Ink runtime fixture', () => {
  it('captures color, NO_COLOR, OSC 8, visible hyperlink fallback, and ASCII borders', () => {
    configureTerminal({ term: 'xterm-256color', termProgram: 'iTerm.app' });
    useUIStore.getState().setTerminalSize({ columns: 60, rows: 20 });
    const rich = render(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-rich"
        source="# Color [site](https://example.com)"
        isFinal={true}
      />,
    );
    const richBytes = lastCapturedBytes(rich.stdout.frames);
    expect(richBytes).toMatch(/\u001b\[[0-9;]+m/u);
    expect(richBytes).toContain('\u001b]8;;https://example.com/\u001b\\');
    rich.unmount();

    process.env.NO_COLOR = '1';
    delete process.env.TERM_PROGRAM;
    const plain = render(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-no-color"
        source="# Color [site](https://example.com)"
        isFinal={true}
      />,
    );
    const plainBytes = lastCapturedBytes(plain.stdout.frames);
    expect(plainBytes).not.toMatch(/\u001b\[(?:3[0-7]|9[0-7])m/u);
    expect(plainBytes.replace(/\u001b\[[0-9;]*m/gu, '')).toContain('site (https://example.com/)');
    plain.unmount();

    process.env.TERM = 'dumb';
    const ascii = render(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-ascii"
        source={'| A | B |\n| - | - |\n| one | two |'}
        isFinal={true}
      />,
    );
    const asciiFrame = ascii.lastFrame() ?? '';
    expect(asciiFrame).toContain('+');
    expect(asciiFrame).toContain('-');
    expect(asciiFrame).not.toContain('┌');
    ascii.unmount();
  });

  it('reflows tables and code during continuous resize without reparsing', async () => {
    vi.useFakeTimers();
    configureTerminal({ term: 'xterm-256color' });
    process.env.NO_COLOR = '1';
    const source =
      '| Name | Description |\n| :--- | ---: |\n| neko | long descriptive value |\n\n```ts\nconst longIdentifierWithoutBreaks = 1;\n```';
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    useUIStore.getState().setTerminalSize({ columns: 64, rows: 20 });
    const view = render(
      <CanonicalMarkdownRenderer sessionKey="runtime-resize" source={source} isFinal={true} />,
    );
    expect(view.lastFrame()).toContain('┌');

    useUIStore.getState().setTerminalSize({ columns: 24, rows: 20 });
    view.rerender(
      <CanonicalMarkdownRenderer sessionKey="runtime-resize" source={source} isFinal={true} />,
    );
    useUIStore.getState().setTerminalSize({ columns: 12, rows: 20 });
    view.rerender(
      <CanonicalMarkdownRenderer sessionKey="runtime-resize" source={source} isFinal={true} />,
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);

    const narrowFrame = view.lastFrame() ?? '';
    expect(narrowFrame).toContain('Name');
    expect(narrowFrame).toContain('Description');
    expect(narrowFrame).not.toContain('┌');
    expect(narrowFrame.split('\n').filter((line) => line.includes('long')).length).toBeGreaterThan(
      1,
    );
    expect(
      new Set(
        events
          .filter((event) => event.type === 'document-projected')
          .map((event) => event.revision),
      ),
    ).toEqual(new Set([1]));
    expect(events.some((event) => event.type === 'layout-discarded')).toBe(false);
    const widths = events
      .filter((event) => event.type === 'layout-created')
      .map((event) => event.viewportWidth);
    expect(widths[0]).toBe(64);
    expect(widths.at(-1)).toBe(12);
    expect(widths).not.toContain(24);
    view.unmount();
    unsubscribe();
  });

  it('keeps incomplete fence and table syntax on one session through finalize', () => {
    configureTerminal({ term: 'xterm-256color' });
    process.env.NO_COLOR = '1';
    useUIStore.getState().setTerminalSize({ columns: 40, rows: 20 });
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const view = render(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-incomplete"
        source={'```ts\nconst value = 1;'}
        isFinal={false}
      />,
    );
    view.rerender(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-incomplete"
        source={'```ts\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| one |'}
        isFinal={false}
      />,
    );
    view.rerender(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-incomplete"
        source={'```ts\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| one | two |'}
        isFinal={true}
      />,
    );

    expect(view.lastFrame()).toContain('const value = 1;');
    expect(view.lastFrame()).toContain('two');
    expect(events.filter((event) => event.type === 'session-created')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'source-updated')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'source-update-coalesced')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'session-finalized')).toHaveLength(1);
    view.unmount();
    unsubscribe();
  });

  it('keeps provider controls inert and captures only renderer-owned SGR/OSC sequences', () => {
    configureTerminal({ term: 'xterm-256color', termProgram: 'iTerm.app' });
    const hostile = '\u001b]52;c;payload\u0007\u001b[2J\u0001\u0085';
    useUIStore.getState().setTerminalSize({ columns: 80, rows: 20 });
    const view = render(
      <CanonicalMarkdownRenderer
        sessionKey="runtime-control-safety"
        source={`# Safe [link](https://example.com) ${hostile}`}
        isFinal={true}
      />,
    );
    const bytes = lastCapturedBytes(view.stdout.frames);
    expect(bytes).not.toContain('\u001b]52;c;payload');
    expect(bytes).not.toContain('\u001b[2J');
    expect(bytes).toContain('␛]52;c;payload␇␛[2J␁\\u{0085}');
    const rendererSequencesRemoved = bytes
      .replace(/\u001b\[[0-9;]*m/gu, '')
      .replace(/\u001b\]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)/gu, '');
    expect(rendererSequencesRemoved).not.toContain('\u001b');
    view.unmount();
  });
});

function configureTerminal(options: {
  readonly term: string;
  readonly termProgram?: string;
}): void {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  process.env.TERM = options.term;
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  if (options.termProgram === undefined) delete process.env.TERM_PROGRAM;
  else process.env.TERM_PROGRAM = options.termProgram;
}

function lastCapturedBytes(frames: readonly string[]): string {
  const frame = frames.at(-1);
  if (frame === undefined) throw new Error('Ink runtime fixture captured no stdout frame.');
  return frame;
}

function restoreEnv(name: keyof typeof originalEnv, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

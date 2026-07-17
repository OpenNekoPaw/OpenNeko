import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithPresentation } from '../../__tests__/render-with-presentation';
import { MessageItem } from '../ChatView/MessageItem';
import {
  subscribeTerminalMarkdownPathEvents,
  type TerminalMarkdownPathEvent,
} from '../../markdown/path-observer';
import type { Message } from '../../types/state';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, '../..');
const originalNoColor = process.env.NO_COLOR;

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalNoColor;
});

describe('assistant Markdown canonical-path poison gates', () => {
  it('keeps removed regex/final-only modules absent and assistant MessageItem free of fallback imports', () => {
    const removed = [
      resolve(sourceRoot, 'components/Markdown/MarkdownRenderer.tsx'),
      resolve(sourceRoot, 'components/Markdown/CodeBlock.tsx'),
      resolve(sourceRoot, 'utils/markdown-parser.ts'),
      resolve(sourceRoot, 'utils/syntax-highlight.ts'),
    ];
    expect(removed.map((path) => existsSync(path))).toEqual([false, false, false, false]);
    const messageItem = readFileSync(
      resolve(sourceRoot, 'components/ChatView/MessageItem.tsx'),
      'utf8',
    );
    expect(messageItem).toContain('CanonicalMarkdownRenderer');
    expect(messageItem).not.toContain('StreamingText');
    expect(messageItem).not.toContain('react-markdown');
    expect(messageItem).not.toContain("from '../Markdown/MarkdownRenderer'");
  });

  it('routes first delta, intermediate streaming, and finalization through one observed session', () => {
    process.env.NO_COLOR = '1';
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const message = assistantMessage('stream-message', '');
    const view = renderWithPresentation(
      <MessageItem message={message} isStreaming currentDelta="**fir" />,
    );
    view.rerender(<MessageItem message={message} isStreaming currentDelta="**first delta**" />);
    const finalized = assistantMessage('stream-message', '**first delta**');
    view.rerender(<MessageItem message={finalized} />);
    unsubscribe();

    expect(events.filter((event) => event.type === 'session-created')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'source-updated')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'source-update-coalesced')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'session-finalized')).toHaveLength(1);
  });

  it('routes historical final and timeline assistant rows through canonical sessions', () => {
    process.env.NO_COLOR = '1';
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const historical = assistantMessage('history-message', '# Historical');
    const historyView = renderWithPresentation(<MessageItem message={historical} />);
    expect(historyView.lastFrame()).toContain('Historical');

    const timeline = assistantMessage('timeline-message', '');
    timeline.timelineRows = [
      {
        id: 'timeline-assistant-row',
        sequence: 1,
        kind: 'assistant_text',
        status: 'streaming',
        content: '| A | B |\n| - | - |\n| 1 |',
        timestamp: 1,
      },
    ];
    const timelineView = renderWithPresentation(<MessageItem message={timeline} />);
    timeline.timelineRows = [
      {
        ...timeline.timelineRows[0]!,
        status: 'complete',
        content: '| A | B |\n| - | - |\n| 1 | 2 |',
      },
    ];
    timelineView.rerender(<MessageItem message={timeline} />);
    unsubscribe();

    expect(
      events.some((event) => event.type === 'session-created' && event.key === 'history-message'),
    ).toBe(true);
    expect(
      events.filter(
        (event) => event.type === 'session-created' && event.key === 'timeline-assistant-row',
      ),
    ).toHaveLength(1);
    expect(
      events.some(
        (event) => event.type === 'session-finalized' && event.key === 'timeline-assistant-row',
      ),
    ).toBe(true);
  });
});

function assistantMessage(id: string, content: string): Message {
  return {
    id,
    role: 'assistant',
    content,
    toolCalls: [],
    todos: [],
    timestamp: 1,
  };
}

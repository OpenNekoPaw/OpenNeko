import React from 'react';
import { render as renderInk } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import type { Message, TerminalTimelineRow } from '../../types/state';
import { MessageItem } from './MessageItem';

function renderInChinese(message: Message): ReturnType<typeof renderInk> {
  return renderInk(
    <AgentTerminalPresentationProvider value={createTestAgentTerminalPresentation('zh-cn')}>
      <MessageItem message={message} />
    </AgentTerminalPresentationProvider>,
  );
}

function timelineRow(id: string, overrides: Partial<TerminalTimelineRow>): TerminalTimelineRow {
  return {
    id,
    sequence: 1,
    kind: 'tool',
    status: 'running',
    timestamp: 1,
    ...overrides,
  };
}

function assistantMessage(
  timelineRows: readonly TerminalTimelineRow[],
  todos: Message['todos'] = [],
): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    toolCalls: [],
    todos: [...todos],
    timelineRows: [...timelineRows],
    timestamp: 1,
  };
}

describe('MessageItem timeline localization', () => {
  it('localizes owned timeline fallbacks while preserving external names, details, and anchors', () => {
    const view = renderInChinese(
      assistantMessage([
        timelineRow('tool-fallback', { kind: 'tool' }),
        timelineRow('task-fallback', { kind: 'task' }),
        timelineRow('media-fallback', { kind: 'media' }),
        timelineRow('external-tool', {
          kind: 'tool',
          toolName: 'VendorSearch',
          details: 'Provider stage: quota_probe',
        }),
        timelineRow('diagnostic', {
          kind: 'diagnostic',
          status: 'error',
          diagnosticCode: 'unknown-tool-result-anchor',
          parent: { kind: 'tool', id: 'stable-call-1' },
        }),
      ]),
    );

    const frame = view.lastFrame();
    expect(frame).toContain('工具');
    expect(frame).toContain('任务');
    expect(frame).toContain('媒体任务');
    expect(frame).toContain('VendorSearch');
    expect(frame).toContain('Provider stage: quota_probe');
    expect(frame).toContain('tool_result 事件引用了未知工具。');
    expect(frame).toContain('parent=tool:stable-call-1');
    view.unmount();
  });

  it('localizes the owned system-error wrapper while preserving the error detail', () => {
    const detail = 'EACCES: /external/原文';
    const view = renderInChinese({
      id: 'system-error-1',
      role: 'system',
      content: detail,
      toolCalls: [],
      todos: [],
      timestamp: 1,
      isError: true,
    });

    expect(view.lastFrame()).toContain(`错误：${detail}`);
    view.unmount();
  });

  it('keeps authored todo content unchanged under a Chinese presentation context', () => {
    const authoredContent = 'Verify ConfigManager API remains byte-stable';
    const view = renderInChinese(
      assistantMessage([], [{ content: authoredContent, status: 'completed' }]),
    );

    expect(view.lastFrame()).toContain(authoredContent);
    view.unmount();
  });
});

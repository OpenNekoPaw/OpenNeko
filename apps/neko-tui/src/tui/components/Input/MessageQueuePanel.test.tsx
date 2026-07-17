import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import React from 'react';
import { cleanup, render as inkRender } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { createAgentTerminalFormatters } from '../../presentation/formatters';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';
import { testAgentStore as useAgentStore } from '../../__tests__/test-runtime';
import { SharedTuiTestRuntimeProvider } from '../../__tests__/test-runtime';
import { MessageQueuePanel } from './MessageQueuePanel';

afterEach(() => {
  cleanup();
  useAgentStore.getState().reset();
});

function renderWithPresentation(node: React.ReactElement, locale: SupportedLocale = 'en') {
  const presentation = createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone: 'UTC' }),
  });
  return inkRender(
    <SharedTuiTestRuntimeProvider>
      <AgentTerminalPresentationProvider value={presentation}>
        {node}
      </AgentTerminalPresentationProvider>
    </SharedTuiTestRuntimeProvider>,
  );
}

describe('MessageQueuePanel', () => {
  it('renders nothing for an empty queue', () => {
    const view = renderWithPresentation(<MessageQueuePanel />);
    expect(view.lastFrame()).toBe('');
  });

  it('renders the queue panel immediately before the composer region', () => {
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 1,
      version: 1,
      items: [
        {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: 'Queued before composer',
          createdAt: 1,
          source: 'user',
        },
      ],
    });

    const frame = renderWithPresentation(
      <Box flexDirection="column">
        <Text>TRANSCRIPT_END</Text>
        <MessageQueuePanel />
        <Text>COMPOSER_START</Text>
      </Box>,
    ).lastFrame()!;

    expect(frame.indexOf('TRANSCRIPT_END')).toBeLessThan(frame.indexOf('Queued before composer'));
    expect(frame.indexOf('Queued before composer')).toBeLessThan(frame.indexOf('COMPOSER_START'));
  });

  it('shows ordered content above the composer without making ids primary copy', () => {
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 2,
      version: 1,
      items: [
        {
          id: 'queue-internal-1',
          conversationId: 'conv-1',
          content: 'Analyze the first ten pages',
          createdAt: 1,
          source: 'user',
        },
        {
          id: 'queue-internal-2',
          conversationId: 'conv-1',
          content: 'Send the storyboard to Canvas',
          createdAt: 2,
          source: 'composer',
        },
      ],
    });

    const frame = renderWithPresentation(<MessageQueuePanel />).lastFrame()!;
    expect(frame).toContain('Next turn · 2');
    expect(frame).toContain('1. message: Analyze the first ten pages');
    expect(frame).toContain('2. message: Send the storyboard to Canvas');
    expect(frame).toContain('/queue list');
    expect(frame).not.toContain('queue-internal-1');
  });

  it('wires send-next, edit, and cancel shortcuts to the first visible user message', async () => {
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 1,
      version: 1,
      items: [
        {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: 'Revise the storyboard',
          createdAt: 1,
          source: 'user',
        },
      ],
    });
    const onSendNext = vi.fn();
    const onEdit = vi.fn();
    const onCancel = vi.fn();
    const view = renderWithPresentation(
      <MessageQueuePanel onSendNext={onSendNext} onEdit={onEdit} onCancel={onCancel} />,
    );

    expect(view.lastFrame()).toContain('Queue shortcuts: ^N Send next · ^E Edit · ^X Cancel');
    await writeInput(view, '\x0e');
    await writeInput(view, '\x05');
    await writeInput(view, '\x18');

    expect(onSendNext).toHaveBeenCalledWith('queue-1');
    expect(onEdit).toHaveBeenCalledWith('queue-1');
    expect(onCancel).toHaveBeenCalledWith('queue-1');
  });

  it('does not expose user-edit shortcuts for an internal continuation', () => {
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 1,
      version: 1,
      items: [
        {
          id: 'task-1',
          conversationId: 'conv-1',
          content: 'Continue task',
          createdAt: 1,
          source: 'task-result-continuation',
        },
      ],
    });

    const frame = renderWithPresentation(<MessageQueuePanel />).lastFrame()!;
    expect(frame).not.toContain('^E');
    expect(frame).not.toContain('^X');
  });

  it('distinguishes priority continuations and collapses extra rows', () => {
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 3,
      version: 1,
      items: [
        {
          id: 'task-1',
          conversationId: 'conv-1',
          content: '继续处理任务结果',
          createdAt: 1,
          source: 'task-result-continuation',
        },
        {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: '生成分镜表',
          createdAt: 2,
          source: 'user',
        },
        {
          id: 'queue-2',
          conversationId: 'conv-1',
          content: '发送到 Canvas',
          createdAt: 3,
          source: 'user',
        },
      ],
    });

    const frame = renderWithPresentation(<MessageQueuePanel />, 'zh-cn').lastFrame()!;
    expect(frame).toContain('下一轮 · 3');
    expect(frame).toContain('内部续跑优先');
    expect(frame).toContain('任务续跑: 继续处理任务结果');
    expect(frame).toContain('+1 条');
  });

  it('projects the paused-after-cancel state without hiding accepted messages', () => {
    useAgentStore.getState().setMessageQueueSnapshot({
      conversationId: 'conv-1',
      pendingCount: 1,
      version: 1,
      items: [
        {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: 'Keep this follow-up pending',
          createdAt: 1,
          source: 'user',
        },
      ],
    });
    useAgentStore.getState().setMessageQueuePausedAfterCancel(true);

    const frame = renderWithPresentation(<MessageQueuePanel />).lastFrame()!;
    expect(frame).toContain('Next turn · 1 · Queue paused after cancellation');
    expect(frame).toContain('Keep this follow-up pending');
    expect(frame).toContain('^N Send next');
  });
});

async function writeInput(instance: ReturnType<typeof inkRender>, value: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  instance.stdin.write(value);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

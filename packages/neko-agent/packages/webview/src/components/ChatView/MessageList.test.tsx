import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { MessageList } from './MessageList';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { I18nProvider } from '@/i18n/I18nContext';
import { chat as enChat } from '@/i18n/locales/en/chat';
import { chat as zhCnChat } from '@/i18n/locales/zh-cn/chat';
import { I18nService } from '@neko/shared';

const scrollToMock = vi.fn();
const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelAnimationFrameMock = vi.fn<(handle: number) => void>();
const getTotalSizeMock = vi.fn<() => number>();
const getOffsetForIndexMock =
  vi.fn<
    (index: number, alignment: 'auto' | 'center' | 'end' | 'start') => readonly [number, string]
  >();
let virtualItems: Array<{ index: number; key: string; start: number }> = [];

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => virtualItems,
    getTotalSize: getTotalSizeMock,
    getOffsetForIndex: getOffsetForIndexMock,
    measureElement: vi.fn(),
  }),
}));

describe('MessageList auto-scroll lifecycle', () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    requestAnimationFrameMock.mockClear();
    cancelAnimationFrameMock.mockClear();
    getTotalSizeMock.mockReset();
    getOffsetForIndexMock.mockReset();
    getTotalSizeMock.mockReturnValue(120);
    getOffsetForIndexMock.mockImplementation((index, alignment) => [index * 100, alignment]);
    virtualItems = [];

    requestAnimationFrameMock.mockReturnValue(1);
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrameMock,
    });
    Object.defineProperty(HTMLDivElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels pending auto-scroll frames when the list unmounts', () => {
    const { unmount } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it('restores follow-tail exactly once when a conversation becomes active', () => {
    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          viewport={{ followMode: 'follow-tail' }}
        />
      </MessageActionsProvider>,
    );

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    flushLatestAnimationFrame();
    expect(scrollToMock).toHaveBeenCalledWith({ top: 120, behavior: 'auto' });
  });

  it('restores a detached viewport from its stable message anchor on activation', () => {
    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1'), createMessage('message-2')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          viewport={{
            followMode: 'detached',
            anchorMessageId: 'message-2',
            anchorOffset: 17,
          }}
        />
      </MessageActionsProvider>,
    );

    flushLatestAnimationFrame();
    expect(getOffsetForIndexMock).toHaveBeenCalledWith(1, 'start');
    expect(scrollToMock).toHaveBeenCalledWith({ top: 117, behavior: 'auto' });
  });

  it('does not reinterpret a clamped programmatic tail scroll as detached user intent', () => {
    const onViewportChange = vi.fn();
    getTotalSizeMock.mockReturnValue(500);
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          onViewportChange={onViewportChange}
        />
      </MessageActionsProvider>,
    );
    const list = requireMessageList(container);
    defineViewportMetrics(list, { scrollTop: 0, scrollHeight: 500, clientHeight: 100 });

    flushLatestAnimationFrame();
    expect(scrollToMock).toHaveBeenCalledWith({ top: 400, behavior: 'auto' });
    list.scrollTop = 400;
    fireEvent.scroll(list);

    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('captures detached intent relative to the first projected item of a message', () => {
    const onViewportChange = vi.fn();
    virtualItems = [{ index: 1, key: 'final-content', start: 80 }];
    getOffsetForIndexMock.mockImplementation((index, alignment) => [
      index === 0 ? 20 : 80,
      alignment,
    ]);
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessageWithFinalContentAndProcessRecords()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          onViewportChange={onViewportChange}
        />
      </MessageActionsProvider>,
    );
    const list = requireMessageList(container);
    defineViewportMetrics(list, { scrollTop: 95, scrollHeight: 500, clientHeight: 100 });

    fireEvent.scroll(list);

    expect(onViewportChange).toHaveBeenCalledWith({
      followMode: 'detached',
      anchorMessageId: 'message-with-process',
      anchorOffset: 75,
    });
    expect(getOffsetForIndexMock).toHaveBeenCalledWith(0, 'start');
  });

  it('reports follow-tail when the user returns to the tail threshold', () => {
    const onViewportChange = vi.fn();
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          viewport={{
            followMode: 'detached',
            anchorMessageId: 'message-1',
            anchorOffset: 40,
          }}
          onViewportChange={onViewportChange}
        />
      </MessageActionsProvider>,
    );
    const list = requireMessageList(container);
    defineViewportMetrics(list, { scrollTop: 376, scrollHeight: 500, clientHeight: 100 });

    fireEvent.scroll(list);

    expect(onViewportChange).toHaveBeenCalledWith({ followMode: 'follow-tail' });
  });

  it('keeps detached foreground streaming stable while follow-tail owns streaming scroll', () => {
    const initial = createStreamingTextMessage('first');
    const detachedProps = {
      isThinking: false,
      streamingMessageId: initial.id,
      activeConversationId: 'conv-1',
      viewport: {
        followMode: 'detached' as const,
        anchorMessageId: initial.id,
        anchorOffset: 10,
      },
    };
    const { rerender, unmount } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList messages={[initial]} {...detachedProps} />
      </MessageActionsProvider>,
    );
    flushLatestAnimationFrame();
    requestAnimationFrameMock.mockClear();
    scrollToMock.mockClear();

    rerender(
      <MessageActionsProvider>
        <MessageList messages={[createStreamingTextMessage('second')]} {...detachedProps} />
      </MessageActionsProvider>,
    );
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
    expect(scrollToMock).not.toHaveBeenCalled();
    unmount();

    requestAnimationFrameMock.mockClear();
    scrollToMock.mockClear();
    const followInitial = createStreamingTextMessage('first');
    const followProps = {
      isThinking: false,
      streamingMessageId: followInitial.id,
      activeConversationId: 'conv-2',
      viewport: { followMode: 'follow-tail' as const },
    };
    const followRender = renderWithI18n(
      <MessageActionsProvider>
        <MessageList messages={[followInitial]} {...followProps} />
      </MessageActionsProvider>,
    );
    flushLatestAnimationFrame();
    requestAnimationFrameMock.mockClear();
    scrollToMock.mockClear();

    followRender.rerender(
      <MessageActionsProvider>
        <MessageList messages={[createStreamingTextMessage('second')]} {...followProps} />
      </MessageActionsProvider>,
    );
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    flushLatestAnimationFrame();
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('does not scroll for an unrelated rerender and cancels the previous activation frame on switch', () => {
    const messages = [createMessage('message-1')];
    const { rerender } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={messages}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-a"
        />
      </MessageActionsProvider>,
    );

    rerender(
      <MessageActionsProvider>
        <MessageList
          messages={messages}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-a"
        />
      </MessageActionsProvider>,
    );
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    rerender(
      <MessageActionsProvider>
        <MessageList
          messages={messages}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-b"
        />
      </MessageActionsProvider>,
    );
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
  });

  it('renders repeated tool blocks as a collapsed group in the virtualized list', () => {
    virtualItems = [{ index: 0, key: 'tool-group', start: 0 }];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createToolMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByRole('button', { name: /ReadDocument x3/ })).toBeTruthy();
    expect(screen.getByText('/books/a.epub')).toBeTruthy();
  });

  it('does not require a Canvas transfer action for auto-delivered storyboard Markdown', () => {
    virtualItems = [{ index: 0, key: 'storyboard', start: 0 }];
    registerDefaultRenderers();

    renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true, cut: false, sketch: false }}>
        <MessageList
          messages={[createStoryboardMarkdownMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('renders storyboard resources from prior assistant ReadImage context', () => {
    virtualItems = [
      { index: 0, key: 'read-image', start: 0 },
      { index: 1, key: 'storyboard', start: 80 },
    ];

    renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
        <MessageList
          messages={[createReadImageContextMessage(), createStoryboardMarkdownMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1.jpg');
    expect(screen.queryByText(/no image resource context/)).toBeNull();
    expect(screen.queryByText('P1')).toBeNull();
  });

  it('renders collapsed process records before final content when they happened first', () => {
    virtualItems = [
      { index: 0, key: 'process-records', start: 0 },
      { index: 1, key: 'final-content', start: 80 },
    ];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessageWithFinalContentAndProcessRecords()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    const processRecordsButton = screen.getByRole('button', { name: /Process records/ });
    const finalContent = screen.getByText('Final storyboard summary.');
    expect(processRecordsButton.compareDocumentPosition(finalContent)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText('Analyze source pages.')).toBeNull();
    expect(screen.queryByText('ReadDocument')).toBeNull();

    fireEvent.click(processRecordsButton);

    expect(screen.getByText(/Analyze source pages/)).toBeTruthy();
    expect(screen.getByText('ReadDocument')).toBeTruthy();
  });

  it('does not show completed process records as running while the parent message is still streaming', () => {
    virtualItems = [
      { index: 0, key: 'process-records', start: 0 },
      { index: 1, key: 'streaming-content', start: 80 },
    ];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createStreamingMessageWithCompletedProcessRecords()]}
          isThinking={false}
          streamingMessageId="message-with-completed-process"
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    const processRecordsButton = screen.getByRole('button', { name: /Process records/ });

    expect(processRecordsButton.querySelector('.animate-spin')).toBeNull();
  });

  it('does not render activation progress as a standalone row above messages', () => {
    virtualItems = [];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
          activationProgress={[
            {
              conversationId: 'conv-1',
              activationId: 'activation-1',
              target: 'skill',
              action: 'activate',
              name: 'quality-review',
              source: 'agent-tool',
              requestedBy: 'agent',
              reason: 'Agent selected review',
              status: 'succeeded',
              events: [
                activationEvent('event-1', 'requested', 'succeeded', 1),
                activationEvent('event-2', 'validated', 'succeeded', 2),
                activationEvent('event-3', 'active', 'succeeded', 3),
              ],
            },
          ]}
        />
      </MessageActionsProvider>,
    );

    expect(screen.queryByRole('button', { name: /Skill succeeded/ })).toBeNull();
    expect(screen.queryByText('quality-review')).toBeNull();
    expect(screen.queryByText('requested')).toBeNull();
  });
});

function flushLatestAnimationFrame(): void {
  const callback = requestAnimationFrameMock.mock.calls.at(-1)?.[0];
  if (!callback) throw new Error('Expected a scheduled animation frame.');
  callback(0);
}

function requireMessageList(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector<HTMLDivElement>('.agent-message-list');
  if (!element) throw new Error('Expected MessageList scroll element.');
  return element;
}

function defineViewportMetrics(
  element: HTMLDivElement,
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
): void {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, value, writable: true });
  }
}

function renderWithI18n(node: React.ReactElement, locale: 'en' | 'zh-cn' = 'en') {
  const service = new I18nService(locale);
  service.registerBundle('chat', 'en', enChat);
  service.registerBundle('chat', 'zh-cn', zhCnChat);
  const result = render(<I18nProvider service={service}>{node}</I18nProvider>);
  return {
    ...result,
    rerender(next: React.ReactElement): void {
      result.rerender(<I18nProvider service={service}>{next}</I18nProvider>);
    },
  };
}

function createMessage(id: string): Message {
  return {
    id,
    role: 'assistant',
    content: 'Hello',
    timestamp: 1_717_200_000_000,
  };
}

function createToolMessage(): Message {
  return {
    id: 'message-tools',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    contentBlocks: [
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
      toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
    ],
  };
}

function createReadImageContextMessage(): Message {
  return {
    id: 'message-read-image',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    contentBlocks: [
      {
        id: 'read-image-block',
        type: 'tool_call',
        timestamp: 10,
        toolCall: {
          id: 'read-image-1',
          name: 'ReadImage',
          arguments: {},
          result: {
            success: true,
            data: {
              imageInfo: [
                {
                  alias: 'P1',
                  label: 'Page 1',
                  resourceRef: {
                    id: 'page-1',
                    scope: 'project',
                    provider: 'read-image',
                    kind: 'media',
                    source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
                    locator: { kind: 'file', path: 'images/page-1.jpg' },
                    fingerprint: {
                      strategy: 'provider',
                      providerId: 'read-image',
                      value: 'page-1',
                    },
                  },
                },
              ],
            },
            attachments: [
              {
                type: 'image',
                path: 'vscode-webview://page-1.jpg',
                mimeType: 'image/jpeg',
              },
            ],
          },
        },
      },
    ],
  };
}

function createStoryboardMarkdownMessage(): Message {
  return {
    id: 'message-storyboard-markdown',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_001_000,
    contentBlocks: [
      {
        id: 'storyboard-text',
        type: 'text',
        timestamp: 20,
        content: [
          '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | full page | keep | 3s | Page opening frame | slow push | low rumble | lead |  | cinematic frame | needs-review | split-panels | story | narrative beat | true |  |',
        ].join('\n'),
      },
    ],
  };
}

function createMessageWithFinalContentAndProcessRecords(): Message {
  return {
    id: 'message-with-process',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    contentBlocks: [
      {
        id: 'thinking-1',
        type: 'thinking',
        timestamp: 1,
        thinking: 'Analyze source pages.',
        isThinkingComplete: true,
      },
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      {
        id: 'text-1',
        type: 'text',
        timestamp: 20,
        content: 'Final storyboard summary.',
      },
    ],
  };
}

function createStreamingMessageWithCompletedProcessRecords(): Message {
  return {
    id: 'message-with-completed-process',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    isStreaming: true,
    contentBlocks: [
      toolBlock('tool-1', 'ReadDocument', 'manifest', 10),
      {
        id: 'text-1',
        type: 'text',
        timestamp: 20,
        content:
          '清单显示这本 EPUB 是按单页章节组织的，接下来我用 manifest cursor 顺序读取前 10 个页面批次。',
        isStreaming: false,
      },
    ],
  };
}

function createStreamingTextMessage(content: string): Message {
  return {
    id: 'message-streaming',
    role: 'assistant',
    content,
    timestamp: 1_717_200_000_000,
    isStreaming: true,
  };
}

function toolBlock(id: string, name: string, filePath: string, duration: number) {
  return {
    id: `block-${id}`,
    type: 'tool_call' as const,
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: true,
        data: { file_path: filePath },
        duration,
      },
    },
  };
}

function activationEvent(
  id: string,
  step:
    | 'requested'
    | 'validated'
    | 'loaded'
    | 'prepared'
    | 'record-created'
    | 'projected'
    | 'active'
    | 'failed',
  status: 'pending' | 'running' | 'succeeded' | 'failed',
  at: number,
) {
  return {
    id,
    activationId: 'activation-1',
    conversationId: 'conv-1',
    target: 'skill' as const,
    action: 'activate' as const,
    name: 'quality-review',
    step,
    status,
    source: 'agent-tool' as const,
    requestedBy: 'agent' as const,
    reason: 'Agent selected review',
    at,
  };
}

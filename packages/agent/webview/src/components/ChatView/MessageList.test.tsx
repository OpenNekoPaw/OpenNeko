import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko/agent-contracts';
import { MessageActionsProvider } from './MessageActionsContext';
import { MessageList as MessageListComponent } from './MessageList';
import type { MessageIdentityMap } from './message-identity';
import { registerDefaultRenderers } from './RichContent';
import { I18nProvider } from '../../i18n/I18nContext';
import { chat as enChat } from '../../i18n/locales/en/chat';
import { chat as zhCnChat } from '../../i18n/locales/zh-cn/chat';
import { I18nService } from '@neko/ui/i18n';

const scrollToMock = vi.fn();
const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelAnimationFrameMock = vi.fn<(handle: number) => void>();
const getTotalSizeMock = vi.fn<() => number>();
const getOffsetForIndexMock =
  vi.fn<
    (index: number, alignment: 'auto' | 'center' | 'end' | 'start') => readonly [number, string]
  >();
const revealDocumentLocatorMock = vi.fn();
const sendToPluginMock = vi.fn();
const clipboardWriteTextMock = vi.fn<(value: string) => Promise<void>>();
const useVirtualizerMock = vi.fn();
let virtualItems: Array<{ index: number; key: string; start: number }> = [];

const testIdentities: MessageIdentityMap = {
  user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
  assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
};

function MessageList(props: Omit<ComponentProps<typeof MessageListComponent>, 'identities'>) {
  return <MessageListComponent {...props} identities={testIdentities} />;
}

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: unknown) => {
    useVirtualizerMock(options);
    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: getTotalSizeMock,
      getOffsetForIndex: getOffsetForIndexMock,
      measureElement: vi.fn(),
    };
  },
}));

vi.mock('../../host-runtime-context', () => ({
  useAgentHostMessages: () => ({
    openFile: vi.fn(),
    confirmTool: vi.fn(),
    revealDocumentLocator: revealDocumentLocatorMock,
    invokeAgentCapabilityLifecycle: vi.fn(),
    sendToPlugin: sendToPluginMock,
    requestCanvasAuthoringHandoff: vi.fn(),
  }),
}));

describe('MessageList auto-scroll lifecycle', () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    requestAnimationFrameMock.mockClear();
    cancelAnimationFrameMock.mockClear();
    getTotalSizeMock.mockReset();
    getOffsetForIndexMock.mockReset();
    revealDocumentLocatorMock.mockReset();
    sendToPluginMock.mockReset();
    clipboardWriteTextMock.mockReset();
    useVirtualizerMock.mockClear();
    clipboardWriteTextMock.mockResolvedValue();
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteTextMock },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets React schedule virtual measurements outside the current lifecycle', () => {
    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(useVirtualizerMock).toHaveBeenCalledWith(
      expect.objectContaining({ useFlushSync: false }),
    );
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
    virtualItems = [{ index: 0, key: 'assistant-turn', start: 20 }];
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

  it('renders repeated tool blocks inside one turn activity disclosure', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Processed/ }));
    expect(screen.getByText('ReadDocument ×3')).toBeTruthy();
    expect(screen.getByText('/books/a.epub')).toBeTruthy();
  });

  it('does not require a Canvas transfer action for auto-delivered storyboard Markdown', () => {
    virtualItems = [{ index: 0, key: 'storyboard', start: 0 }];
    registerDefaultRenderers();

    renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true, cut: false }}>
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

    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe(
      'http://127.0.0.1:43125/resources/page-1.jpg',
    );
    expect(screen.queryByText(/no image resource context/)).toBeNull();
    expect(screen.queryByText('P1')).toBeNull();
  });

  it('renders one collapsed process disclosure before the final answer', () => {
    virtualItems = [{ index: 0, key: 'assistant-turn', start: 0 }];

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

    const processRecordsButton = screen.getByRole('button', { name: 'Processed 2m 28s' });
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

  it('keeps a multi-step run in one flat disclosure without Response or Tool headers', () => {
    virtualItems = [{ index: 0, key: 'assistant-turn', start: 0 }];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createDenseAssistantTurn()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('Final answer with readable Markdown.')).toBeTruthy();
    expect(screen.queryByText('Response')).toBeNull();
    expect(screen.queryByText('Tool')).toBeNull();
    const activityButton = screen.getByRole('button', { name: 'Processed 2m 28s' });
    expect(screen.getAllByRole('button', { name: /Processed/ })).toHaveLength(1);
    expect(screen.queryByText('2 tool call(s) · 1 thinking block(s)')).toBeNull();

    fireEvent.click(activityButton);

    const activity = screen.getByRole('region', { name: 'Processing details' });
    expect(within(activity).getByText('ReadDocument')).toBeTruthy();
    expect(within(activity).getByText('ReadImage')).toBeTruthy();
    expect(within(activity).getByText('Inspect the source.')).toBeTruthy();
    expect(within(activity).getAllByRole('button')).toHaveLength(1);
    expect(within(activity).getByText('2 tool call(s) · 1 thinking block(s)')).toBeTruthy();
    const orderedText = activity.textContent ?? '';
    expect(orderedText.indexOf('I will inspect the document.')).toBeLessThan(
      orderedText.indexOf('ReadDocument'),
    );
    expect(orderedText.indexOf('ReadDocument')).toBeLessThan(
      orderedText.indexOf('Inspect the source.'),
    );
    expect(orderedText.indexOf('Inspect the source.')).toBeLessThan(
      orderedText.indexOf('The document contains image pages.'),
    );
    expect(orderedText.indexOf('The document contains image pages.')).toBeLessThan(
      orderedText.indexOf('ReadImage'),
    );
  });

  it('keeps document pages as Tool evidence with compact open, reference, and Canvas actions', () => {
    virtualItems = [{ index: 0, key: 'document-evidence', start: 0 }];

    const { container } = renderWithI18n(
      <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
        <MessageList
          messages={[createDocumentEvidenceMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Processed/ }));
    const activity = screen.getByRole('region', { name: 'Processing details' });
    const openButton = within(activity).getByTitle(/^Open Page 1/);
    expect(within(openButton).queryByRole('img')).toBeNull();
    fireEvent.click(openButton);
    expect(revealDocumentLocatorMock).toHaveBeenCalledWith({
      contentLocator: {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'books/a.epub' },
        entryPath: 'image/Page_1.jpg',
      },
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
    });
    expect(container.querySelector('.agent-turn-deliverables')).toBeNull();
    const moreActions = within(activity).getByLabelText('More image actions');
    expect(moreActions.closest('details')?.hasAttribute('open')).toBe(false);

    fireEvent.click(moreActions);
    fireEvent.click(within(activity).getByRole('button', { name: 'Copy reference' }));
    expect(clipboardWriteTextMock).toHaveBeenCalledWith('books/a.epub#chapter:Page_1@1');
    fireEvent.click(within(activity).getByRole('button', { name: 'Send to Canvas' }));
    expect(sendToPluginMock).toHaveBeenCalledWith(
      'canvas',
      expect.objectContaining({ kind: 'singleAsset' }),
    );
  });

  it('keeps the Turn summary running until authoritative completion arrives', () => {
    virtualItems = [{ index: 0, key: 'assistant-turn', start: 0 }];

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

    const processRecordsButton = screen.getByRole('button', { name: /Processing/ });

    expect(processRecordsButton.querySelector('.animate-spin')).not.toBeNull();
  });

  it('keeps failed actions visible before the collapsed processing summary', () => {
    virtualItems = [{ index: 0, key: 'actionable-turn', start: 0 }];

    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createActionableTurn()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    const failedTool = screen.getByText('WriteFile');
    const summary = screen.getByRole('button', { name: /Processed/ });
    expect(screen.getByText('Permission denied')).toBeTruthy();
    expect(failedTool.compareDocumentPosition(summary)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText('ReadDocument')).toBeNull();
  });

  it('renders temporary execution activity on the latest user message and removes it at idle', () => {
    virtualItems = [{ index: 0, key: 'user-message', start: 0 }];
    const props = {
      messages: [{ ...createMessage('message-1'), role: 'user' as const }],
      isThinking: true,
      streamingMessageId: null,
      activeConversationId: 'conv-1',
    };
    const { container, rerender } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList {...props} agentState={{ phase: 'thinking', startedAt: Date.now() }} />
      </MessageActionsProvider>,
    );

    const transcript = container.querySelector('.agent-message-list');
    const activity = screen.getByRole('status', { name: 'Agent execution in progress' });
    expect(transcript?.contains(activity)).toBe(true);
    expect(activity.dataset.placement).toBe('user-message');
    expect(activity.textContent).toContain('Working');
    expect(activity.textContent).not.toContain('Thinking');
    expect(container.querySelector('.agent-run-status')).toBeNull();

    rerender(
      <MessageActionsProvider>
        <MessageList {...props} isThinking={false} agentState={null} />
      </MessageActionsProvider>,
    );
    expect(screen.queryByRole('status', { name: 'Agent execution in progress' })).toBeNull();
  });

  it('marks only the latest user message with authoritative processing state and visible time', () => {
    virtualItems = [
      { index: 0, key: 'historical-user', start: 0 },
      { index: 1, key: 'assistant', start: 80 },
      { index: 2, key: 'current-user', start: 160 },
    ];
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[
            { ...createMessage('historical-user'), role: 'user', timestamp: 1_000 },
            { ...createMessage('assistant'), timestamp: 2_000 },
            { ...createMessage('current-user'), role: 'user', timestamp: 3_000 },
          ]}
          isThinking
          streamingMessageId={null}
          activeConversationId="conv-1"
          agentState={{ phase: 'thinking', startedAt: 3_000 }}
        />
      </MessageActionsProvider>,
    );

    const statuses = screen.getAllByRole('status', { name: 'Agent execution in progress' });
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.closest('.agent-message-row')?.textContent).toContain(
      createMessage('current-user').content,
    );
    const timestamps = [...container.querySelectorAll('[data-message-timestamp]')];
    expect(timestamps).toHaveLength(2);
    expect(timestamps[0]?.className).toContain('opacity-0');
    expect(timestamps[1]?.className).toContain('opacity-100');
  });

  it('does not render execution activity after the final assistant response is visible', () => {
    virtualItems = [{ index: 0, key: 'completed-response', start: 0 }];

    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('completed-response')]}
          isThinking
          streamingMessageId={null}
          activeConversationId="conv-1"
          agentState={{ phase: 'thinking', startedAt: Date.now() }}
        />
      </MessageActionsProvider>,
    );

    expect(container.querySelector('.agent-message-row')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Agent execution in progress' })).toBeNull();
  });

  it('places every rendered transcript item inside the shared centered rail', () => {
    virtualItems = [
      { index: 0, key: 'message', start: 0 },
      { index: 1, key: 'assistant', start: 80 },
    ];
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('message-1')]}
          isThinking
          streamingMessageId={null}
          activeConversationId="conv-1"
          agentState={{ phase: 'thinking', startedAt: Date.now() }}
        />
      </MessageActionsProvider>,
    );

    const items = [...container.querySelectorAll('.agent-message-list-item')];
    const rails = [...container.querySelectorAll('.agent-transcript-rail')];
    expect(rails).toHaveLength(items.length);
    expect(
      items.every((item) => item.firstElementChild?.classList.contains('agent-transcript-rail')),
    ).toBe(true);
  });

  it('uses a neutral user prompt and unframed Agent content while preserving avatar chrome', () => {
    virtualItems = [
      { index: 0, key: 'user', start: 0 },
      { index: 1, key: 'assistant', start: 80 },
    ];
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[
            { ...createMessage('user-message'), role: 'user', content: 'User prompt' },
            createMessage('assistant-message'),
          ]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(container.querySelector('.agent-user-prompt')?.textContent).toBe('User prompt');
    expect(container.querySelector('.agent-turn-answer')).toBeTruthy();
    expect(container.querySelector('.agent-bubble-assistant')).toBeNull();
    expect(container.querySelector('[title="You"]')).toBeTruthy();
    expect(container.querySelector('[title="Assistant"]')).toBeTruthy();
  });

  it('keeps system activity unchanged and renders errors as localized inline alerts', () => {
    virtualItems = [
      { index: 0, key: 'system', start: 0 },
      { index: 1, key: 'error', start: 60 },
    ];
    const { container } = renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[
            { ...createMessage('system-message'), role: 'system', content: 'Queued request' },
            {
              ...createMessage('error-message'),
              content: 'Configured provider has no usable credential.',
              isError: true,
            },
          ]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.getByText('Queued request')).toBeTruthy();
    expect(container.querySelector('.agent-system-notice')).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert.classList.contains('agent-inline-diagnostic')).toBe(true);
    expect(alert.textContent).toContain('Error');
    expect(alert.textContent).toContain('Configured provider has no usable credential.');
  });

  it('copies the visible final answer from structured content blocks', async () => {
    virtualItems = [{ index: 0, key: 'structured-answer', start: 0 }];
    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createStructuredCopyMessage()]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith('Visible final answer.');
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    });
  });

  it('hides message-level Copy when a structured item has no visible text answer', () => {
    virtualItems = [{ index: 0, key: 'activity-only', start: 0 }];
    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[
            {
              ...createMessage('activity-only'),
              content: 'Hidden fallback content',
              contentBlocks: [
                { id: 'thinking', type: 'thinking', timestamp: 1, thinking: 'Working' },
              ],
            },
          ]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull();
  });

  it('shows a fail-visible state when the clipboard boundary rejects the write', async () => {
    clipboardWriteTextMock.mockRejectedValueOnce(new Error('clipboard denied'));
    virtualItems = [{ index: 0, key: 'copy-failure', start: 0 }];
    renderWithI18n(
      <MessageActionsProvider>
        <MessageList
          messages={[createMessage('copy-failure')]}
          isThinking={false}
          streamingMessageId={null}
          activeConversationId="conv-1"
        />
      </MessageActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy();
    });
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

function createStructuredCopyMessage(): Message {
  return {
    ...createMessage('structured-copy'),
    content: 'Hidden fallback content.',
    contentBlocks: [
      { id: 'thinking', type: 'thinking', timestamp: 1, thinking: 'Hidden activity.' },
      {
        id: 'tool',
        type: 'tool_call',
        timestamp: 2,
        toolCall: {
          id: 'tool-call',
          name: 'ReadDocument',
          arguments: { path: 'notes.md' },
          result: { success: true, data: 'Hidden tool result.' },
        },
      },
      { id: 'answer', type: 'text', timestamp: 3, content: 'Visible final answer.' },
    ],
  };
}

function createToolMessage(): Message {
  return {
    id: 'message-tools',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    turnTiming: { startedAt: 10, completedAt: 20 },
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
                  contentLocator: {
                    kind: 'workspace-file',
                    path: 'images/page-1.jpg',
                  },
                },
              ],
            },
            attachments: [
              {
                type: 'image',
                path: 'http://127.0.0.1:43125/resources/page-1.jpg',
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
    turnTiming: { startedAt: 1, completedAt: 148_001 },
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
    turnTiming: { startedAt: Date.now() - 28_000 },
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

function createDenseAssistantTurn(): Message {
  return {
    id: 'message-dense-turn',
    role: 'assistant',
    content: '',
    timestamp: 1_717_200_000_000,
    turnTiming: { startedAt: 1, completedAt: 148_001 },
    contentBlocks: [
      {
        id: 'progress-1',
        type: 'text',
        timestamp: 1,
        content: 'I will inspect the document.',
      },
      toolBlock('tool-dense-1', 'ReadDocument', '/books/a.epub', 10),
      {
        id: 'thinking-dense',
        type: 'thinking',
        timestamp: 12,
        thinking: 'Inspect the source.',
        isThinkingComplete: true,
      },
      {
        id: 'progress-2',
        type: 'text',
        timestamp: 14,
        content: 'The document contains image pages.',
      },
      toolBlock('tool-dense-2', 'ReadImage', '/books/page-1.png', 20),
      {
        id: 'answer-dense',
        type: 'text',
        timestamp: 30,
        content: 'Final answer with readable Markdown.',
      },
    ],
  };
}

function createDocumentEvidenceMessage(): Message {
  return {
    id: 'message-document-evidence',
    role: 'assistant',
    content: '',
    timestamp: 10,
    turnTiming: { startedAt: 10, completedAt: 20 },
    contentBlocks: [
      {
        id: 'read-image-evidence',
        type: 'tool_call',
        timestamp: 10,
        toolCall: {
          id: 'read-image-evidence-call',
          name: 'ReadImage',
          arguments: { path: 'books/a.epub' },
          result: {
            success: true,
            data: {
              source: { filePath: 'books/a.epub', format: 'epub' },
              mode: 'metadata',
              images: [
                {
                  label: 'Page 1',
                  renderUri: 'http://127.0.0.1:43125/resources/page-1.jpg',
                  width: 1494,
                  height: 2133,
                  byteSize: 2048,
                  mimeType: 'image/jpeg',
                  metadata: {
                    documentIndex: 1,
                    locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
                  },
                  contentLocator: {
                    kind: 'document-entry',
                    source: { kind: 'workspace-file', path: 'books/a.epub' },
                    entryPath: 'image/Page_1.jpg',
                  },
                },
              ],
              imageCount: 1,
            },
            attachments: [{ type: 'image', path: 'page-1.jpg' }],
          },
        },
      },
      { id: 'answer', type: 'text', timestamp: 20, content: 'Final analysis.' },
    ],
  };
}

function createActionableTurn(): Message {
  return {
    id: 'message-actionable-turn',
    role: 'assistant',
    content: '',
    timestamp: 10,
    turnTiming: { startedAt: 10, completedAt: 20 },
    contentBlocks: [
      {
        id: 'failed-tool',
        type: 'tool_call',
        timestamp: 10,
        toolCall: {
          id: 'failed-tool-call',
          name: 'WriteFile',
          arguments: { path: 'result.md' },
          result: { success: false, data: null, error: 'Permission denied' },
        },
      },
      toolBlock('successful-tool', 'ReadDocument', 'source.epub', 12),
      { id: 'answer', type: 'text', timestamp: 20, content: 'Could not save the result.' },
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

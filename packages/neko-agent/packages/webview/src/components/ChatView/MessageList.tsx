/**
 * MessageList - 消息列表组件
 * P2: 使用虚拟滚动优化长对话性能
 * Optimized: Message grouping for consecutive same-role messages
 * Enhanced: Flattened content blocks for chronological rendering
 */

import { useRef, useEffect, useCallback, useMemo, type UIEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message } from '@neko-agent/types';
import type { TabViewportSnapshot } from '@/render-runtime/tab-render-runtime';
import { MessageItem } from '@/components/ChatView/MessageItem';
import { ContentBlockItem } from '@/components/ChatView/ContentBlockItem';
import { ProcessRecordsGroup } from '@/components/ChatView/ProcessRecordsGroup';
import { MessageAvatar } from '@/components/ChatView/MessageAvatar';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import {
  DEFAULT_MESSAGE_IDENTITIES,
  type MessageIdentityMap,
} from '@/components/ChatView/message-identity';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import {
  estimateMessageListItemHeight,
  projectMessageList,
} from '@/presenters/message-list-presenter';

interface MessageListProps {
  messages: Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  activeConversationId: string | null;
  identities?: MessageIdentityMap;
  activationProgress?: readonly ActivationProgressTimeline[];
  viewport?: TabViewportSnapshot;
  onViewportChange?: (viewport: TabViewportSnapshot) => void;
}

export function MessageList({
  messages,
  isThinking,
  streamingMessageId,
  activeConversationId,
  identities = DEFAULT_MESSAGE_IDENTITIES,
  activationProgress = [],
  viewport = { followMode: 'follow-tail' },
  onViewportChange,
}: MessageListProps) {
  const { pluginsAvailable } = useMessageActions();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevItemCountRef = useRef(0);
  const prevIsThinkingRef = useRef(false);
  const prevConversationIdRef = useRef<string | null>(null);
  const prevStreamingContentRef = useRef<{
    conversationId: string | null;
    message: Message | undefined;
  }>({ conversationId: null, message: undefined });
  const lastReportedViewportRef = useRef<TabViewportSnapshot>(viewport);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollWindowRef = useRef<Window | null>(null);
  const programmaticScrollTargetRef = useRef<number | null>(null);

  const projection = useMemo(
    () =>
      projectMessageList({
        messages,
        isThinking,
        streamingMessageId,
        plugins: pluginsAvailable,
        activationProgress,
      }),
    [messages, isThinking, streamingMessageId, pluginsAvailable, activationProgress],
  );

  const flattenedItems = projection.items;
  const itemCount = projection.itemCount;

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(
      (index: number) => estimateMessageListItemHeight(flattenedItems[index]),
      [flattenedItems],
    ),
    overscan: 5,
  });
  const virtualizerRef = useRef(virtualizer);
  const flattenedItemsRef = useRef(flattenedItems);
  const viewportRef = useRef(viewport);
  virtualizerRef.current = virtualizer;
  flattenedItemsRef.current = flattenedItems;
  viewportRef.current = viewport;

  const cancelScheduledAutoScroll = useCallback(() => {
    const scrollWindow = autoScrollWindowRef.current ?? getElementWindow(parentRef.current);
    if (autoScrollRafRef.current !== null && scrollWindow) {
      scrollWindow.cancelAnimationFrame(autoScrollRafRef.current);
    }
    autoScrollRafRef.current = null;
    autoScrollWindowRef.current = null;
  }, []);

  const scheduleScrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = 'smooth') => {
      const scrollElement = parentRef.current;
      const scrollWindow = getElementWindow(scrollElement);
      if (!scrollElement || !scrollWindow) return;

      cancelScheduledAutoScroll();
      autoScrollWindowRef.current = scrollWindow;
      autoScrollRafRef.current = scrollWindow.requestAnimationFrame(() => {
        autoScrollRafRef.current = null;
        autoScrollWindowRef.current = null;
        if (!isScrollableElementConnected(scrollElement)) return;
        const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
        const target = Math.max(0, maxScrollTop > 0 ? Math.min(offset, maxScrollTop) : offset);
        programmaticScrollTargetRef.current = target;
        scrollElement.scrollTo({ top: target, behavior });
      });
    },
    [cancelScheduledAutoScroll],
  );

  useEffect(() => cancelScheduledAutoScroll, [cancelScheduledAutoScroll]);

  // Viewport restoration belongs to conversation activation, not ordinary foreground rerenders.
  useEffect(() => {
    const activeViewport = viewportRef.current;
    lastReportedViewportRef.current = activeViewport;
    programmaticScrollTargetRef.current = null;
    cancelScheduledAutoScroll();

    if (activeViewport.followMode === 'follow-tail') {
      scheduleScrollToOffset(virtualizerRef.current.getTotalSize(), 'auto');
      return;
    }

    const anchorIndex = flattenedItemsRef.current.findIndex(
      (item) => item.ownerMessageId === activeViewport.anchorMessageId,
    );
    if (anchorIndex === -1) return;
    const offsetInfo = virtualizerRef.current.getOffsetForIndex(anchorIndex, 'start');
    if (!offsetInfo) return;
    scheduleScrollToOffset(offsetInfo[0] + (activeViewport.anchorOffset ?? 0), 'auto');
  }, [activeConversationId, cancelScheduledAutoScroll, scheduleScrollToOffset]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      if (autoScrollRafRef.current !== null) {
        cancelScheduledAutoScroll();
      }
      const programmaticTarget = programmaticScrollTargetRef.current;
      if (programmaticTarget !== null && Math.abs(programmaticTarget - element.scrollTop) <= 1) {
        programmaticScrollTargetRef.current = null;
        return;
      }
      programmaticScrollTargetRef.current = null;
      if (!onViewportChange) return;

      const distanceFromTail = element.scrollHeight - element.clientHeight - element.scrollTop;
      const currentVirtualizer = virtualizerRef.current;
      const nextViewport =
        distanceFromTail <= 24
          ? ({ followMode: 'follow-tail' } satisfies TabViewportSnapshot)
          : captureDetachedViewport(
              element.scrollTop,
              currentVirtualizer.getVirtualItems(),
              flattenedItemsRef.current,
              (index) => currentVirtualizer.getOffsetForIndex(index, 'start')?.[0],
            );
      if (!nextViewport || isMatchingViewport(lastReportedViewportRef.current, nextViewport))
        return;
      lastReportedViewportRef.current = nextViewport;
      onViewportChange(nextViewport);
    },
    [cancelScheduledAutoScroll, onViewportChange],
  );

  // Auto-scroll only for foreground growth owned by the current follow-tail conversation.
  useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== activeConversationId;
    const itemCountChanged = itemCount !== prevItemCountRef.current;
    const thinkingStarted = isThinking && !prevIsThinkingRef.current;
    prevConversationIdRef.current = activeConversationId;
    prevItemCountRef.current = itemCount;
    prevIsThinkingRef.current = isThinking;

    if (
      !conversationChanged &&
      viewport.followMode === 'follow-tail' &&
      (itemCountChanged || thinkingStarted)
    ) {
      scheduleScrollToOffset(virtualizerRef.current.getTotalSize());
    }
  }, [activeConversationId, itemCount, isThinking, scheduleScrollToOffset, viewport.followMode]);

  const streamingMessage = streamingMessageId
    ? messages.find((message) => message.id === streamingMessageId)
    : undefined;
  useEffect(() => {
    const previous = prevStreamingContentRef.current;
    prevStreamingContentRef.current = {
      conversationId: activeConversationId,
      message: streamingMessage,
    };
    if (
      previous.conversationId !== activeConversationId ||
      previous.message === streamingMessage ||
      !streamingMessageId ||
      viewport.followMode !== 'follow-tail'
    ) {
      return;
    }
    if (projection.streamingItemIndex === -1) return;
    const offsetInfo = virtualizerRef.current.getOffsetForIndex(
      projection.streamingItemIndex,
      'end',
    );
    if (offsetInfo) scheduleScrollToOffset(offsetInfo[0]);
  }, [
    activeConversationId,
    projection.streamingItemIndex,
    scheduleScrollToOffset,
    streamingMessage,
    streamingMessageId,
    viewport.followMode,
  ]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="agent-message-list flex-1 overflow-y-auto scrollbar-auto-hide"
      style={{ contain: 'strict' }}
      onScroll={handleScroll}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = flattenedItems[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="agent-message-list-item py-0.5">
                {item.kind === 'thinking_indicator' ? (
                  <ThinkingIndicator identity={identities.assistant} />
                ) : item.kind === 'content_block' ? (
                  <ContentBlockItem
                    projection={item.projection}
                    isFirst={item.isFirst}
                    isLast={item.isLast}
                    isStreaming={item.isStreaming}
                    conversationId={activeConversationId}
                    messageId={item.messageId}
                    workItemIds={item.workItemIds}
                    siblingBlocks={item.siblingBlocks}
                    ambientToolCalls={item.ambientToolCalls}
                    assistantIdentity={identities.assistant}
                  />
                ) : item.kind === 'process_group' ? (
                  <ProcessRecordsGroup
                    processGroup={item.processGroup}
                    isFirst={item.isFirst}
                    isStreaming={item.isStreaming}
                    conversationId={activeConversationId}
                    messageId={item.messageId}
                    workItemIds={item.workItemIds}
                    siblingBlocks={item.siblingBlocks}
                    ambientToolCalls={item.ambientToolCalls}
                    assistantIdentity={identities.assistant}
                  />
                ) : (
                  <MessageItem
                    message={item.message}
                    isGrouped={item.isGrouped}
                    conversationId={activeConversationId}
                    identities={identities}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function captureDetachedViewport(
  scrollTop: number,
  virtualItems: readonly { readonly index: number; readonly start: number }[],
  items: readonly { readonly ownerMessageId: string | null }[],
  getItemStart: (index: number) => number | undefined,
): TabViewportSnapshot | null {
  const ownedItems = virtualItems.flatMap((virtualItem) => {
    const ownerMessageId = items[virtualItem.index]?.ownerMessageId;
    return ownerMessageId ? [{ ...virtualItem, ownerMessageId }] : [];
  });
  if (ownedItems.length === 0) return null;
  const visibleAnchor =
    [...ownedItems].reverse().find((item) => item.start <= scrollTop) ?? ownedItems[0];
  if (!visibleAnchor) return null;

  const messageFirstItemIndex = items.findIndex(
    (item) => item.ownerMessageId === visibleAnchor.ownerMessageId,
  );
  if (messageFirstItemIndex === -1) return null;
  const messageStart = getItemStart(messageFirstItemIndex);
  if (messageStart === undefined) return null;
  return {
    followMode: 'detached',
    anchorMessageId: visibleAnchor.ownerMessageId,
    anchorOffset: Math.max(0, scrollTop - messageStart),
  };
}

function isMatchingViewport(current: TabViewportSnapshot, next: TabViewportSnapshot): boolean {
  return (
    current.followMode === next.followMode &&
    current.anchorMessageId === next.anchorMessageId &&
    current.anchorOffset === next.anchorOffset
  );
}

function getElementWindow(element: HTMLElement | null): Window | null {
  return element?.ownerDocument.defaultView ?? null;
}

function isScrollableElementConnected(element: HTMLElement): boolean {
  return Boolean(element.isConnected && element.ownerDocument.defaultView);
}

// Thinking indicator component (matches new message layout)
function ThinkingIndicator({ identity }: { identity: MessageIdentityMap['assistant'] }) {
  return (
    <div className="py-0.5">
      <div className="flex gap-2.5 px-3 py-1.5">
        {/* Avatar */}
        <div className="flex-shrink-0 w-7 pt-0.5">
          <MessageAvatar
            role="assistant"
            label={identity.avatarLabel}
            imageUri={identity.avatarUri}
            size="md"
            title={identity.title}
          />
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0 max-w-[85%]">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium text-[var(--vscode-textLink-foreground)]">
              {identity.displayName}
            </span>
          </div>
          {/* Bubble with dots */}
          <div className="agent-bubble agent-bubble-assistant inline-block rounded-2xl rounded-tl-md px-3 py-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--vscode-descriptionForeground)] rounded-full animate-bounce [animation-delay:-0.32s]" />
              <span className="w-1.5 h-1.5 bg-[var(--vscode-descriptionForeground)] rounded-full animate-bounce [animation-delay:-0.16s]" />
              <span className="w-1.5 h-1.5 bg-[var(--vscode-descriptionForeground)] rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

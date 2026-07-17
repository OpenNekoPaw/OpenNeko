/**
 * ChatView Component
 *
 * Scrollable message list container.
 * Renders all messages from the conversation store
 * with streaming state for the latest assistant message.
 * Includes inline activity indicator (Claude Code style).
 */

import React, { useLayoutEffect, useRef } from 'react';
import { Box, measureElement, type DOMElement } from 'ink';
import {
  useTuiAgentStore as useAgentStore,
  useTuiConversationStore as useConversationStore,
  useTuiUIStore as useUIStore,
} from '../../runtime/tui-runtime-context';
import { MessageItem } from './MessageItem';
import { ActivityIndicator } from './ActivityIndicator';

export function ChatView(): React.JSX.Element {
  const messages = useConversationStore((s) => s.messages);
  const currentDelta = useConversationStore((s) => s.currentDelta);
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const currentThinking = useConversationStore((s) => s.currentThinking);
  const status = useAgentStore((s) => s.status);
  const scrollOffset = useUIStore((s) => s.scrollOffset);
  const scrollLimit = useUIStore((s) => s.scrollLimit);
  const terminalRows = useUIStore((s) => s.terminalSize.rows);
  const terminalColumns = useUIStore((s) => s.terminalSize.columns);
  const setScrollLimit = useUIStore((s) => s.setScrollLimit);
  const viewportRef = useRef<DOMElement>(null);
  const contentRef = useRef<DOMElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const viewportHeight = measureElement(viewport).height;
    const contentHeight = measureElement(content).height;
    setScrollLimit(Math.max(0, contentHeight - viewportHeight));
  }, [
    currentDelta,
    currentThinking,
    isStreaming,
    messages,
    setScrollLimit,
    status,
    terminalColumns,
    terminalRows,
  ]);

  const viewportStart = Math.max(0, scrollLimit - scrollOffset);

  return (
    <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexShrink={1} overflowY="hidden">
      <Box ref={contentRef} flexDirection="column" flexShrink={0} marginTop={-viewportStart}>
        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1;
          const isLastAssistant = isLast && msg.role === 'assistant';

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isStreaming={isLastAssistant ? isStreaming : false}
              currentDelta={isLastAssistant ? currentDelta : ''}
              currentThinking={isLastAssistant ? currentThinking : ''}
            />
          );
        })}

        {/* Inline activity indicator — Claude Code style */}
        <ActivityIndicator />
      </Box>
    </Box>
  );
}

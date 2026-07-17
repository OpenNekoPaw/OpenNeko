/**
 * MessageItem Component
 *
 * Renders a single message in the conversation.
 * - User messages: > prefix with input text
 * - Assistant messages: thinking + tool calls + markdown content + todos
 * - System messages: error display
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Message, TerminalTimelineRow } from '../../types/state';
import { INK_TOOL_ICONS, tokens } from '../../theme/tokens';
import { ThinkingBlock } from './ThinkingBlock';
import { TodoList } from './TodoList';
import { CanonicalMarkdownRenderer } from '../Markdown/CanonicalMarkdownRenderer';
import { ReferenceAwareText } from '../shared/ReferenceAwareText';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import {
  presentTimelineFailure,
  presentTimelineProcessLabel,
} from '../../presentation/timeline-presentation';

interface MessageItemProps {
  readonly message: Message;
  /** If this is the last assistant message, show streaming state */
  readonly isStreaming?: boolean;
  readonly currentDelta?: string;
  readonly currentThinking?: string;
}

export function MessageItem({
  message,
  isStreaming = false,
  currentDelta = '',
  currentThinking = '',
}: MessageItemProps): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();

  if (message.role === 'user') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold>{'❯ '}</Text>
          <ReferenceAwareText text={message.content} bold />
        </Box>
      </Box>
    );
  }

  if (message.role === 'system') {
    return (
      <Box
        flexDirection="column"
        marginBottom={1}
        borderStyle="round"
        borderColor={message.isError ? tokens.error : tokens.muted}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text color={message.isError ? tokens.error : undefined}>
          {message.isError
            ? presentation.t('agent.terminal.message.systemError', { detail: message.content })
            : message.content}
        </Text>
      </Box>
    );
  }

  // Assistant message — full rendering pipeline
  const hasThinking = currentThinking || message.thinking;
  const thinkingContent = currentThinking || message.thinking || '';
  const timelineRows = message.timelineRows ?? [];

  if (timelineRows.length > 0) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {timelineRows.map((row) => (
          <TimelineRowLine key={row.id} row={row} />
        ))}
        {message.todos.length > 0 ? <TodoList todos={message.todos} /> : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* 1. Thinking block */}
      {hasThinking ? (
        <ThinkingBlock
          content={thinkingContent}
          isThinking={isStreaming && !!currentThinking && !currentDelta}
        />
      ) : null}

      {/* 2. Tool calls */}
      {message.toolCalls.map((tc) => (
        <ToolCallLine key={tc.id} name={tc.name} args={tc.arguments} status={tc.status} />
      ))}

      {/* 3. Streaming text or final markdown */}
      {isStreaming || message.content ? (
        <CanonicalMarkdownRenderer
          sessionKey={message.id}
          source={isStreaming ? currentDelta : message.content}
          isFinal={!isStreaming}
        />
      ) : null}

      {/* 4. Todo list */}
      {message.todos.length > 0 ? <TodoList todos={message.todos} /> : null}
    </Box>
  );
}

function TimelineRowLine({ row }: { readonly row: TerminalTimelineRow }): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();

  switch (row.kind) {
    case 'assistant_text':
      return row.status === 'streaming' || row.content ? (
        <CanonicalMarkdownRenderer
          sessionKey={row.id}
          source={row.content ?? ''}
          isFinal={row.status !== 'streaming'}
        />
      ) : (
        <Box />
      );
    case 'thinking':
      return (
        <ThinkingBlock
          content={row.content ?? ''}
          isThinking={row.status === 'streaming'}
          maxLines={3}
        />
      );
    case 'tool':
      return (
        <TimelineProcessLine row={row} label={presentTimelineProcessLabel(row, presentation)} />
      );
    case 'task':
      return (
        <TimelineProcessLine row={row} label={presentTimelineProcessLabel(row, presentation)} />
      );
    case 'media':
      return (
        <TimelineProcessLine row={row} label={presentTimelineProcessLabel(row, presentation)} />
      );
    case 'error':
    case 'diagnostic':
      return (
        <Box>
          <Text color={tokens.error}>✗</Text>
          <Text color={tokens.error}> {presentTimelineFailure(row, presentation)}</Text>
          <TimelineAnchor row={row} />
        </Box>
      );
  }
}

function TimelineProcessLine({
  row,
  label,
}: {
  readonly row: TerminalTimelineRow;
  readonly label: string;
}): React.JSX.Element {
  const icon = timelineStatusIcon(row);
  const color = timelineStatusColor(row);
  const detail = [
    row.argsSummary,
    row.confirmationSummary,
    row.resultSummary && !row.resultSummary.includes('\n') ? row.resultSummary : undefined,
    row.backfillSummary,
    row.progress !== undefined ? `${row.progress}%` : undefined,
    row.details,
  ]
    .filter(Boolean)
    .join(' ');

  const multilineResult = row.resultSummary?.includes('\n') ? row.resultSummary : undefined;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{icon}</Text>
        <Text> </Text>
        <Text bold>{label}</Text>
        <TimelineIdentity row={row} />
        {detail ? <Text dimColor> {truncate(detail, 96)}</Text> : null}
        <TimelineAnchor row={row} />
      </Box>
      {multilineResult ? (
        <Box flexDirection="column" marginLeft={2}>
          {multilineResult.split('\n').map((line, index) => (
            <Text key={`${row.id}-result-${index}`} dimColor={index > 0}>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

function TimelineIdentity({
  row,
}: {
  readonly row: TerminalTimelineRow;
}): React.JSX.Element | null {
  const id = row.toolCallId ?? row.taskId;
  if (!id) return null;
  return <Text dimColor> id={id}</Text>;
}

function TimelineAnchor({ row }: { readonly row: TerminalTimelineRow }): React.JSX.Element | null {
  if (!row.parent) return null;
  const suffix = row.parent.id ? `${row.parent.kind}:${row.parent.id}` : row.parent.kind;
  return <Text dimColor> parent={suffix}</Text>;
}

function timelineStatusIcon(row: TerminalTimelineRow): string {
  switch (row.status) {
    case 'success':
    case 'complete':
      return INK_TOOL_ICONS.success;
    case 'error':
    case 'cancelled':
      return INK_TOOL_ICONS.error;
    case 'waiting':
    case 'queued':
    case 'processing':
    case 'running':
    case 'pending':
    case 'streaming':
      return INK_TOOL_ICONS.running;
  }
}

function timelineStatusColor(row: TerminalTimelineRow): string {
  switch (row.status) {
    case 'success':
    case 'complete':
      return tokens.toolSuccess;
    case 'error':
    case 'cancelled':
      return tokens.toolError;
    case 'waiting':
      return tokens.warning;
    case 'queued':
    case 'processing':
    case 'running':
    case 'pending':
    case 'streaming':
      return tokens.toolPending;
  }
}

/** Compact tool call display line */
function ToolCallLine({
  name,
  args,
  status,
}: {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly status: string;
}): React.JSX.Element {
  const icon = INK_TOOL_ICONS[status as keyof typeof INK_TOOL_ICONS] ?? INK_TOOL_ICONS.pending;
  const statusColor =
    status === 'success'
      ? tokens.toolSuccess
      : status === 'error'
        ? tokens.toolError
        : tokens.toolPending;

  return (
    <Box>
      <Text>
        <Text color={statusColor}>{icon}</Text> <Text bold>{name}</Text>{' '}
        <Text dimColor>{summarizeArgs(args)}</Text>
      </Text>
    </Box>
  );
}

/** Create a short summary of tool arguments (max 60 chars) */
function summarizeArgs(args: Record<string, unknown>): string {
  const path = args['path'] ?? args['file_path'] ?? args['filePath'];
  if (typeof path === 'string') return truncate(path, 60);

  const command = args['command'] ?? args['cmd'];
  if (typeof command === 'string') return truncate(command, 60);

  const query = args['query'] ?? args['pattern'];
  if (typeof query === 'string') return truncate(query, 60);

  for (const value of Object.values(args)) {
    if (typeof value === 'string') return truncate(value, 60);
  }

  return '';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

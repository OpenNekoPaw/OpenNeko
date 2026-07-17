/**
 * ActivityIndicator Component
 *
 * Inline execution status displayed at the bottom of ChatView,
 * aligned with Claude Code's conversation-embedded activity style.
 *
 * Shows:
 * - Active tool calls with spinner and argument summary
 * - Thinking/reasoning indicator with elapsed time
 * - Iteration progress
 */

import React from 'react';
import { Box, Text } from 'ink';
import {
  useTuiAgentStore as useAgentStore,
  useTuiConversationStore as useConversationStore,
} from '../../runtime/tui-runtime-context';
import { useTimer } from '../../hooks/useTimer';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import {
  presentGeneratingActivity,
  presentProcessingActivity,
  presentThinkingActivity,
} from '../../presentation/activity-presentation';
import { Spinner } from '../shared/Spinner';

export function ActivityIndicator(): React.JSX.Element | null {
  const status = useAgentStore((s) => s.status);
  const iteration = useAgentStore((s) => s.iteration);
  const messages = useConversationStore((s) => s.messages);
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const currentThinking = useConversationStore((s) => s.currentThinking);
  const elapsed = useTimer();
  const presentation = useAgentTerminalPresentation();

  if (status !== 'running') return null;

  // Get active tool calls from the last assistant message
  const lastMsg = messages[messages.length - 1];
  const activeTools =
    lastMsg?.role === 'assistant'
      ? lastMsg.toolCalls.filter((tc) => tc.status === 'running' || tc.status === 'pending')
      : [];

  const isThinking = !!currentThinking && !isStreaming;

  // Nothing to show if no activity
  if (activeTools.length === 0 && !isThinking && !isStreaming) {
    return (
      <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
        <Box>
          <Spinner />
          <Text dimColor>
            {' '}
            {presentProcessingActivity(
              {
                current: iteration.current,
                max: iteration.max,
                elapsedSeconds: elapsed,
              },
              presentation,
            )}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      {/* Active tool calls */}
      {activeTools.map((tc) => (
        <Box key={tc.id}>
          <Spinner />
          <Text>
            {' '}
            <Text bold>{tc.name}</Text>
            <Text dimColor> {summarizeToolArgs(tc.name, tc.arguments)}</Text>
          </Text>
        </Box>
      ))}

      {/* Thinking indicator */}
      {isThinking ? (
        <Box>
          <Text color={tokens.muted}>{'  · '}</Text>
          <Text color={tokens.muted} italic>
            {presentThinkingActivity({ elapsedSeconds: elapsed }, presentation)}
          </Text>
        </Box>
      ) : null}

      {/* Streaming indicator — shown when receiving content but no tools/thinking */}
      {isStreaming && activeTools.length === 0 && !isThinking ? (
        <Box>
          <Spinner />
          <Text dimColor>
            {' '}
            {presentGeneratingActivity({ elapsedSeconds: elapsed }, presentation)}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

/** Summarize tool arguments for inline display */
function summarizeToolArgs(_name: string, args: Record<string, unknown>): string {
  // File operations — show path
  const path = args['path'] ?? args['file_path'] ?? args['filePath'];
  if (typeof path === 'string') return truncate(path, 60);

  // Search operations — show pattern/query
  const pattern = args['pattern'] ?? args['query'] ?? args['glob'];
  if (typeof pattern === 'string') {
    const filePath = args['path'] ?? args['file_path'];
    const parts = [truncate(String(pattern), 40)];
    if (typeof filePath === 'string') {
      parts.push(`in ${truncate(String(filePath), 30)}`);
    }
    return parts.join(' ');
  }

  // Bash/command
  const command = args['command'] ?? args['cmd'];
  if (typeof command === 'string') return truncate(command, 60);

  // Fallback: first string value
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value.length > 0) return truncate(value, 60);
  }

  return '';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

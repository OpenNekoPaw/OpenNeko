/**
 * ThinkingBlock Component
 *
 * Displays Claude's extended thinking content.
 * Claude Code style: "* Thinking..." with italic muted text.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import {
  presentThinkingBlockHeader,
  presentThinkingBlockMoreLines,
} from '../../presentation/activity-presentation';
import { Spinner } from '../shared/Spinner';

interface ThinkingBlockProps {
  /** Thinking content */
  readonly content: string;
  /** Whether thinking is still in progress */
  readonly isThinking: boolean;
  /** Max preview lines to show (default: 3) */
  readonly maxLines?: number;
}

export function ThinkingBlock({
  content,
  isThinking,
  maxLines = 3,
}: ThinkingBlockProps): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();
  const lines = content.split('\n').filter((l) => l.trim());
  const displayLines = lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  return (
    <Box flexDirection="column" marginBottom={0}>
      {/* Header — Claude Code style */}
      {isThinking ? (
        <Box>
          <Text color={tokens.muted} italic>
            {'* '}
          </Text>
          <Spinner
            label={presentThinkingBlockHeader({ isThinking: true, lineCount: 0 }, presentation)}
          />
        </Box>
      ) : (
        <Text color={tokens.muted} italic>
          {presentThinkingBlockHeader({ isThinking: false, lineCount: lines.length }, presentation)}
        </Text>
      )}

      {/* Preview lines */}
      {!isThinking && displayLines.length > 0 ? (
        <>
          {displayLines.map((line, idx) => (
            <Box key={idx} marginLeft={2}>
              <Text dimColor italic>
                {truncate(line, 80)}
              </Text>
            </Box>
          ))}
          {hasMore ? (
            <Box marginLeft={2}>
              <Text dimColor>
                {presentThinkingBlockMoreLines(lines.length - maxLines, presentation)}
              </Text>
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

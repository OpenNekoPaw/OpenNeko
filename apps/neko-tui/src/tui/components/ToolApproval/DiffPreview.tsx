/**
 * DiffPreview Component
 *
 * Renders a unified diff with colored +/- lines and line numbers.
 * Uses computeDiff from @neko/shared for the diff algorithm.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { computeDiff, computeDiffStats, type DiffLine } from '@neko/shared';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';

interface DiffPreviewProps {
  /** Original content */
  readonly oldContent: string;
  /** New content */
  readonly newContent: string;
  /** File path label */
  readonly filePath?: string;
  /** Max lines to show (default: 30) */
  readonly maxLines?: number;
}

export function DiffPreview({
  oldContent,
  newContent,
  filePath,
  maxLines = 30,
}: DiffPreviewProps): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();
  const diffLines = computeDiff(oldContent, newContent);
  const stats = computeDiffStats(diffLines);
  const displayLines = diffLines.slice(0, maxLines);
  const hasMore = diffLines.length > maxLines;

  return (
    <Box flexDirection="column">
      {/* Header */}
      {filePath ? (
        <Text dimColor>
          {'─── '}
          {filePath}
          {' ───'}
        </Text>
      ) : null}

      {/* Stats */}
      <Box>
        <Text color={tokens.diffAdded}>+{stats.added}</Text>
        <Text> </Text>
        <Text color={tokens.diffRemoved}>-{stats.removed}</Text>
      </Box>

      {/* Diff lines */}
      {displayLines.map((line, idx) => (
        <DiffLineView key={idx} line={line} />
      ))}

      {/* Truncation notice */}
      {hasMore ? (
        <Text dimColor>
          {presentation.t(
            diffLines.length - maxLines === 1
              ? 'agent.terminal.approval.moreLines.one'
              : 'agent.terminal.approval.moreLines.many',
            { count: presentation.format.count(diffLines.length - maxLines) },
          )}
        </Text>
      ) : null}
    </Box>
  );
}

function DiffLineView({ line }: { readonly line: DiffLine }): React.JSX.Element {
  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
  const color =
    line.type === 'add'
      ? tokens.diffAdded
      : line.type === 'remove'
        ? tokens.diffRemoved
        : tokens.diffContext;

  // Line number
  const lineNum =
    line.type === 'remove'
      ? String(line.oldLineNum ?? '').padStart(4)
      : String(line.newLineNum ?? '').padStart(4);

  return (
    <Text>
      <Text dimColor>{lineNum} </Text>
      <Text color={color}>
        {prefix} {line.content}
      </Text>
    </Text>
  );
}

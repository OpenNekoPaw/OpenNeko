/**
 * StreamingText Component
 *
 * Renders accumulated text_delta content with a trailing cursor
 * during streaming. On completion, shows the final text.
 *
 * This is the core component that enables Claude Code-like
 * token-by-token streaming output.
 */

import React from 'react';
import { Text } from 'ink';
import { tokens } from '../../theme/tokens';

interface StreamingTextProps {
  /** Accumulated text delta content */
  readonly content: string;
  /** Whether still streaming */
  readonly isStreaming: boolean;
}

export function StreamingText({ content, isStreaming }: StreamingTextProps): React.JSX.Element {
  if (!content && !isStreaming) {
    return <Text />;
  }

  return (
    <Text>
      {content}
      {isStreaming ? <Text color={tokens.info}>▋</Text> : null}
    </Text>
  );
}

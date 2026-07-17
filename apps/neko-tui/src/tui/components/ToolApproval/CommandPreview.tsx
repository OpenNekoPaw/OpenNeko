/**
 * CommandPreview Component
 *
 * Shows a bash command that's about to be executed,
 * with visual emphasis for the tool approval panel.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';

interface CommandPreviewProps {
  /** The command string */
  readonly command: string;
  /** Optional working directory */
  readonly cwd?: string;
}

export function CommandPreview({ command, cwd }: CommandPreviewProps): React.JSX.Element {
  const presentation = useAgentTerminalPresentation();

  return (
    <Box flexDirection="column">
      {cwd ? (
        <Text dimColor>
          {'  '}
          {presentation.t('agent.terminal.approval.cwd', { cwd })}
        </Text>
      ) : null}
      <Box>
        <Text color={tokens.warning}>{'  $ '}</Text>
        <Text bold>{command}</Text>
      </Box>
    </Box>
  );
}

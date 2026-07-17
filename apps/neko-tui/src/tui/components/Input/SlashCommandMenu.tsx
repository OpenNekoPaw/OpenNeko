/**
 * SlashCommandMenu Component
 *
 * Dropdown menu for slash command autocomplete.
 * Shows matching commands as the user types /.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import type { TuiSlashCommandOption } from '../../core/slash-command-catalog';

export type SlashCommandOption = TuiSlashCommandOption;

interface SlashCommandMenuProps {
  /** Available commands */
  readonly commands: SlashCommandOption[];
  /** Current filter text (e.g., "/mod" filters to "/model") */
  readonly filter: string;
  /** Called when a command is selected */
  readonly onSelect: (command: string) => void;
  /** Called when menu is dismissed */
  readonly onDismiss: () => void;
}

export function SlashCommandMenu({
  commands,
  filter,
  onSelect,
  onDismiss,
}: SlashCommandMenuProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const presentation = useAgentTerminalPresentation();

  // Filter commands based on input
  const filterText = filter.startsWith('/') ? filter.slice(1).toLowerCase() : filter.toLowerCase();
  const filtered = commands.filter((cmd) => cmd.name.toLowerCase().includes(filterText));

  useInput((_input, key) => {
    if (key.escape) {
      onDismiss();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filtered.length - 1, prev + 1));
      return;
    }

    if (key.return || key.tab) {
      const selected = filtered[selectedIndex];
      if (selected) {
        onSelect(`/${selected.name}`);
      }
      return;
    }
  });

  if (filtered.length === 0) {
    return (
      <Box marginLeft={2}>
        <Text dimColor>{presentation.t('agent.terminal.chrome.noMatchingCommands')}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginLeft={2}>
      {filtered.slice(0, 8).map((cmd, idx) => (
        <Box key={cmd.name}>
          <Text
            color={idx === selectedIndex ? tokens.info : undefined}
            bold={idx === selectedIndex}
          >
            {idx === selectedIndex ? '▸ ' : '  '}/{cmd.name}
          </Text>
          <Text dimColor> {cmd.description}</Text>
        </Box>
      ))}
      {filtered.length > 8 ? (
        <Text dimColor>
          {' '}
          ... {filtered.length - 8} {presentation.t('agent.terminal.chrome.more')}
        </Text>
      ) : null}
    </Box>
  );
}

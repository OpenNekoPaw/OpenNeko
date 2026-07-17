/**
 * SelectionMenu Component
 *
 * Bordered selection menu with keyboard navigation.
 * Used for model selection, config choices, etc.
 *
 * - Up/Down: navigate items
 * - Enter: confirm selection
 * - Esc: cancel
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { tokens } from '../../theme/tokens';
import { useAgentTerminalPresentation } from '../../presentation/react-context';
import type { PendingSelection } from '../../stores/ui-store';

interface SelectionMenuProps {
  readonly selection: PendingSelection;
}

export function SelectionMenu({ selection }: SelectionMenuProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Default to the active item if any
    const activeIdx = selection.items.findIndex((item) => item.active);
    return activeIdx >= 0 ? activeIdx : 0;
  });
  const presentation = useAgentTerminalPresentation();

  const items = selection.items;
  const maxVisible = 8;
  const total = items.length;
  const visibleCount = Math.min(total, maxVisible);

  // Scroll window
  let scrollTop = 0;
  if (total > visibleCount) {
    scrollTop = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(visibleCount / 2), total - visibleCount),
    );
  }

  const visible = items.slice(scrollTop, scrollTop + visibleCount);
  const hasScrollUp = scrollTop > 0;
  const hasScrollDown = scrollTop + visibleCount < total;

  useInput((_input, key) => {
    if (key.escape) {
      selection.resolve(null);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(total - 1, prev + 1));
      return;
    }

    if (key.return) {
      const item = items[selectedIndex];
      if (item) {
        selection.resolve(item.id);
      }
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={tokens.info}
      paddingLeft={1}
      paddingRight={1}
      marginLeft={1}
      marginRight={1}
    >
      {/* Title */}
      <Text bold>{selection.title}</Text>

      {/* Scroll-up indicator */}
      {hasScrollUp ? (
        <Text dimColor>
          {' '}
          ↑ {scrollTop} {presentation.t('agent.terminal.chrome.more')}
        </Text>
      ) : null}

      {/* Items */}
      {visible.map((item, visIdx) => {
        const realIdx = scrollTop + visIdx;
        const isSelected = realIdx === selectedIndex;
        return (
          <Box key={item.id}>
            <Text color={isSelected ? tokens.info : undefined} bold={isSelected}>
              {isSelected ? '▸ ' : '  '}
              {item.label}
            </Text>
            {item.active ? <Text color={tokens.success}> *</Text> : null}
            {item.description ? <Text dimColor> {item.description}</Text> : null}
          </Box>
        );
      })}

      {/* Scroll-down indicator */}
      {hasScrollDown ? (
        <Text dimColor>
          {' '}
          ↓ {total - scrollTop - visibleCount} {presentation.t('agent.terminal.chrome.more')}
        </Text>
      ) : null}

      {/* Hint */}
      <Text dimColor>{presentation.t('agent.terminal.chrome.selectionHint')}</Text>
    </Box>
  );
}

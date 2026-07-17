/**
 * Spinner Component
 *
 * Braille dot spinner aligned with opencode TUI.
 * Uses Ink's built-in re-rendering for animation.
 */

import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { INK_BRAILLE_SPINNER } from '../../theme/tokens';
import { tokens } from '../../theme/tokens';

interface SpinnerProps {
  /** Optional label text after the spinner */
  readonly label?: string;
}

export function Spinner({ label }: SpinnerProps): React.JSX.Element {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % INK_BRAILLE_SPINNER.frames.length);
    }, INK_BRAILLE_SPINNER.interval);
    return () => clearInterval(timer);
  }, []);

  const char = INK_BRAILLE_SPINNER.frames[frame] ?? INK_BRAILLE_SPINNER.frames[0]!;

  return (
    <Text>
      <Text color={tokens.info}>{char}</Text>
      {label ? <Text dimColor> {label}</Text> : null}
    </Text>
  );
}

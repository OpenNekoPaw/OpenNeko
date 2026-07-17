/**
 * TokenUsage Component
 *
 * Visual progress bar showing input context usage against the combined input+output window.
 */

import React from 'react';
import { Text } from 'ink';
import type { TokenUsage as TokenUsageType } from '../../types/state';
import { tokens } from '../../theme/tokens';

interface TokenUsageProps {
  readonly usage: TokenUsageType;
  /** Effective input-context budget, when known. */
  readonly maxContextTokens?: number;
  /** Resolved output generation cap, when known. */
  readonly maxOutputTokens?: number;
  /** Model hard output cap, when known. */
  readonly modelMaxOutputTokens?: number;
  /** Bar width in characters (default: 15) */
  readonly width?: number;
}

export function TokenUsage({
  usage,
  maxContextTokens,
  maxOutputTokens,
  modelMaxOutputTokens,
  width = 15,
}: TokenUsageProps): React.JSX.Element {
  const outputWindow = getDisplayOutputWindow(maxOutputTokens, modelMaxOutputTokens);
  const displayTokenWindow = isPositiveInteger(maxContextTokens)
    ? maxContextTokens + (outputWindow ?? 0)
    : undefined;
  const hasKnownContextBudget = isPositiveInteger(displayTokenWindow);
  const ratio = hasKnownContextBudget ? Math.min(usage.input / displayTokenWindow, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color based on usage level
  const barColor = ratio > 0.8 ? tokens.error : ratio > 0.5 ? tokens.warning : tokens.success;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Text>
      {hasKnownContextBudget ? <Text color={barColor}>{bar}</Text> : null}
      <Text dimColor>
        {hasKnownContextBudget ? ' ' : ''}ctx:{formatCompact(usage.input)}/
        {hasKnownContextBudget ? formatCompact(displayTokenWindow) : '?'}
      </Text>
    </Text>
  );
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getDisplayOutputWindow(
  maxOutputTokens: number | undefined,
  modelMaxOutputTokens: number | undefined,
): number | undefined {
  if (isPositiveInteger(modelMaxOutputTokens)) return modelMaxOutputTokens;
  if (isPositiveInteger(maxOutputTokens)) return maxOutputTokens;
  return undefined;
}

/**
 * UsageIndicator Component
 * Compact SVG pie chart showing context token usage percentage.
 * Click to trigger context compression.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('UsageIndicator');

// Pie chart geometry
const RADIUS = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface UsageIndicatorProps {
  tokenCount: number;
  maxTokens?: number;
  maxOutputTokens?: number;
  modelMaxOutputTokens?: number;
  isCompressing?: boolean;
  onCompress?: () => Promise<void>;
}

function formatTokenCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'var(--vscode-errorForeground)';
  if (percentage >= 70) return 'var(--vscode-editorWarning-foreground)';
  return 'var(--vscode-descriptionForeground)';
}

export function UsageIndicator({
  tokenCount,
  maxTokens,
  maxOutputTokens,
  modelMaxOutputTokens,
  isCompressing = false,
  onCompress,
}: UsageIndicatorProps) {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);

  const outputWindow = getDisplayOutputWindow(maxOutputTokens, modelMaxOutputTokens);
  const displayTokenWindow = isPositiveInteger(maxTokens)
    ? maxTokens + (outputWindow ?? 0)
    : undefined;
  const hasKnownLimit = isPositiveInteger(displayTokenWindow);
  const percentage = hasKnownLimit ? Math.min((tokenCount / displayTokenWindow) * 100, 100) : 0;
  const color = getUsageColor(percentage);
  // stroke-dashoffset controls how much of the arc is "filled"
  const dashOffset = CIRCUMFERENCE * (1 - percentage / 100);

  const handleClick = useCallback(async () => {
    if (!onCompress || isCompressing) return;
    try {
      await onCompress();
    } catch (error) {
      logger.error('Compression failed:', error);
    }
  }, [onCompress, isCompressing]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={isCompressing || !onCompress}
        className={`agent-composer-tool-button ${isCompressing ? 'cursor-wait' : ''}`}
        title={t('chat.usage.clickToCompress')}
      >
        {isCompressing ? (
          /* Spinning ring while compressing */
          <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin">
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke="var(--vscode-descriptionForeground)"
              strokeWidth="2"
              strokeDasharray={`${CIRCUMFERENCE * 0.75} ${CIRCUMFERENCE * 0.25}`}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          /* Pie chart */
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: 'rotate(-90deg)' }}>
            {/* Track (background circle) */}
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke="var(--vscode-input-background)"
              strokeWidth="10"
            />
            {/* Filled arc */}
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
            {/* Border ring */}
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="0.5"
              opacity="0.4"
            />
          </svg>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="agent-composer-tooltip">
          <div>
            {t('chat.usage.tokens')}: {tokenCount.toLocaleString()} /{' '}
            {hasKnownLimit ? displayTokenWindow.toLocaleString() : t('chat.usage.unknownLimit')}
          </div>
          {hasKnownLimit ? (
            <div className="agent-composer-tooltip-muted">
              {percentage.toFixed(1)}% {t('chat.usage.used')} — {formatTokenCount(tokenCount)}
            </div>
          ) : (
            <div className="agent-composer-tooltip-muted">{formatTokenCount(tokenCount)}</div>
          )}
          {onCompress && !isCompressing && (
            <div className="agent-composer-tooltip-link">{t('chat.usage.clickToCompress')}</div>
          )}
        </div>
      )}
    </div>
  );
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function getDisplayOutputWindow(
  maxOutputTokens: number | undefined,
  modelMaxOutputTokens: number | undefined,
): number | undefined {
  if (isPositiveInteger(modelMaxOutputTokens)) return modelMaxOutputTokens;
  if (isPositiveInteger(maxOutputTokens)) return maxOutputTokens;
  return undefined;
}

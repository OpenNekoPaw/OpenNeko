/**
 * NormalizeLoudnessButton - Analyze loudness and apply recommended gain
 *
 * Sends the element's media source to the engine for ITU-R BS.1770-4 analysis,
 * then writes the recommended gain into `audio.gain` via the existing property change flow.
 */

import { memo, useCallback, useState } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { analyzeLoudness, type LoudnessAnalysisResult } from '../../services/LoudnessService';
import { getLogger } from '../../utils/logger';

const logger = getLogger('NormalizeLoudnessButton');

interface NormalizeLoudnessButtonProps {
  /** Media file path (element.src) */
  source: string;
  /** Callback to apply the recommended gain */
  onApplyGain: (gain: number) => void;
  disabled?: boolean;
}

export const NormalizeLoudnessButton = memo(function NormalizeLoudnessButton({
  source,
  onApplyGain,
  disabled = false,
}: NormalizeLoudnessButtonProps) {
  const { t } = useTranslation();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<LoudnessAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (analyzing || disabled) return;

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const items = await analyzeLoudness([source]);
      const item = items[0];

      if (!item) {
        setError('No analysis result');
        return;
      }

      if (item.error) {
        setError(item.error);
        return;
      }

      if (!item.analysis) {
        setError('No analysis data');
        return;
      }

      setResult(item.analysis);
      onApplyGain(item.analysis.recommendedGain);
      logger.info(
        `Loudness normalized: LUFS=${item.analysis.integratedLufs.toFixed(1)}, gain=${item.analysis.recommendedGain.toFixed(1)} dB`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      logger.error('Loudness analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  }, [source, analyzing, disabled, onApplyGain]);

  return (
    <div className="space-y-1">
      <button
        className="w-full px-2 py-1 text-[11px] rounded
					bg-[var(--vscode-button-secondaryBackground)]
					text-[var(--vscode-button-secondaryForeground)]
					hover:bg-[var(--vscode-button-secondaryHoverBackground)]
					disabled:opacity-50 disabled:cursor-not-allowed
					transition-colors"
        onClick={handleAnalyze}
        disabled={disabled || analyzing}
      >
        {analyzing ? t('audio.normalizing') : t('audio.normalizeLoudness')}
      </button>

      {result && (
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] px-1">
          LUFS: {result.integratedLufs.toFixed(1)} &rarr; {t('audio.gain')}:{' '}
          {result.recommendedGain > 0 ? '+' : ''}
          {result.recommendedGain.toFixed(1)} dB
        </div>
      )}

      {error && (
        <div className="text-[10px] text-[var(--vscode-errorForeground)] px-1">{error}</div>
      )}
    </div>
  );
});

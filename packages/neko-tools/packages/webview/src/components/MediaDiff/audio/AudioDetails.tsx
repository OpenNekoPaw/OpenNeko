/**
 * AudioDetails - Metadata info panel for audio diff.
 * Extracted from AudioDiffViewer.tsx.
 */

import { memo } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';
import { formatDuration, formatBitrate } from './audioUtils';

interface AudioDetailsProps {
  details?: {
    duration: { current: number; previous: number };
    sampleRate: { current: number; previous: number };
    channels: { current: number; previous: number };
    bitrate?: { current: number; previous: number };
    silenceRegions?: {
      current: Array<{ start: number; end: number }>;
      previous: Array<{ start: number; end: number }>;
    };
  };
}

export const AudioDetails = memo(function AudioDetails({ details }: AudioDetailsProps) {
  const { t } = useTranslation();
  if (!details || !details.duration || !details.sampleRate || !details.channels) return null;

  return (
    <div className="p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">
            {t('mediaDiff.audio.duration')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{formatDuration(details.duration.previous)}</span>
            <span>→</span>
            <span className="text-green-400">{formatDuration(details.duration.current)}</span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">
            {t('mediaDiff.audio.sampleRate')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">{details.sampleRate.previous} Hz</span>
            <span>→</span>
            <span className="text-green-400">{details.sampleRate.current} Hz</span>
          </div>
        </div>
        <div>
          <div className="text-[var(--vscode-descriptionForeground)] mb-1">
            {t('mediaDiff.audio.channels')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400">
              {details.channels.previous === 1
                ? t('mediaDiff.audio.mono')
                : details.channels.previous === 2
                  ? t('mediaDiff.audio.stereo')
                  : `${details.channels.previous}ch`}
            </span>
            <span>→</span>
            <span className="text-green-400">
              {details.channels.current === 1
                ? t('mediaDiff.audio.mono')
                : details.channels.current === 2
                  ? t('mediaDiff.audio.stereo')
                  : `${details.channels.current}ch`}
            </span>
          </div>
        </div>
        {details.bitrate && (
          <div>
            <div className="text-[var(--vscode-descriptionForeground)] mb-1">
              {t('mediaDiff.audio.bitrate')}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">{formatBitrate(details.bitrate.previous)}</span>
              <span>→</span>
              <span className="text-green-400">{formatBitrate(details.bitrate.current)}</span>
            </div>
          </div>
        )}
      </div>
      {details.silenceRegions &&
        (details.silenceRegions.previous.length > 0 ||
          details.silenceRegions.current.length > 0) && (
          <div className="mt-3 pt-3 border-t border-[var(--vscode-panel-border)]">
            <div className="text-[var(--vscode-descriptionForeground)] mb-1 text-xs">
              {t('mediaDiff.audio.silentRegions')}
            </div>
            {details.silenceRegions.previous.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {details.silenceRegions.previous.map((region, i) => (
                  <span
                    key={`prev-${i}`}
                    className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded"
                  >
                    {formatDuration(region.start)} - {formatDuration(region.end)}
                  </span>
                ))}
              </div>
            )}
            {details.silenceRegions.current.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {details.silenceRegions.current.map((region, i) => (
                  <span
                    key={`cur-${i}`}
                    className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded"
                  >
                    {formatDuration(region.start)} - {formatDuration(region.end)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
    </div>
  );
});

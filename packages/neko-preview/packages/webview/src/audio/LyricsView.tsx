/**
 * LyricsView - Scrolling synced lyrics display
 *
 * Renders parsed LRC lyrics with the current line highlighted
 * and auto-scrolled to center. Falls back to placeholder when
 * no lyrics are available.
 */

import { useRef, useEffect, useMemo } from 'react';
import { VolumeIcon } from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';
import { findCurrentLineIndex, type LrcLine } from './lrc-parser';

interface LyricsViewProps {
  /** Parsed lyric lines (empty = no lyrics) */
  lyrics: LrcLine[];
  /** Current playback time in seconds */
  currentTime: number;
}

export function LyricsView({ lyrics, currentTime }: LyricsViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Detect plain-text (unsynchronized) lyrics — all lines have time === -1
  const isUnsynchronized = lyrics.length > 0 && lyrics[0]?.time === -1;

  const currentIndex = useMemo(
    () => (isUnsynchronized ? -1 : findCurrentLineIndex(lyrics, currentTime)),
    [lyrics, currentTime, isUnsynchronized],
  );

  // Auto-scroll active line to center (only for synced lyrics)
  useEffect(() => {
    const el = activeRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  // No lyrics — show placeholder
  if (lyrics.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-neko-preview-text-secondary text-sm">
        <div className="text-center opacity-60">
          <VolumeIcon className="mx-auto mb-2 opacity-40" size={40} />
          <div>{t('preview.audio.noLyrics')}</div>
        </div>
      </div>
    );
  }

  const scrollContainerClass =
    'w-full h-full overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-none ' +
    '[mask-image:linear-gradient(to_bottom,transparent_0%,black_15%,black_85%,transparent_100%)]';

  // Unsynchronized plain-text lyrics — static scrollable display
  if (isUnsynchronized) {
    return (
      <div className={scrollContainerClass} ref={containerRef}>
        <div className="flex flex-col items-center px-4 w-full">
          <div className="flex-shrink-0 h-[40%]" />
          {lyrics.map((line, i) => (
            <div
              key={i}
              className="py-2 px-3 text-center text-base font-medium leading-relaxed text-neko-preview-text-primary opacity-70 max-w-full break-words"
            >
              {line.text}
            </div>
          ))}
          <div className="flex-shrink-0 h-[40%]" />
        </div>
      </div>
    );
  }

  return (
    <div className={scrollContainerClass} ref={containerRef}>
      <div className="flex flex-col items-center px-4 w-full">
        {/* Top spacer for centering first line */}
        <div className="flex-shrink-0 h-[40%]" />

        {lyrics.map((line, i) => {
          const isActive = i === currentIndex;
          const isPast = i < currentIndex;
          return (
            <div
              key={`${i}-${line.time}`}
              ref={isActive ? activeRef : undefined}
              className={`py-2 px-3 text-center font-medium leading-relaxed max-w-full break-words transition-all duration-300 ${
                isActive
                  ? 'text-lg font-semibold text-neko-preview-text-primary opacity-100 scale-100'
                  : isPast
                    ? 'text-base text-neko-preview-text-secondary opacity-30 scale-95'
                    : 'text-base text-neko-preview-text-secondary opacity-40 scale-95'
              }`}
            >
              {line.text}
            </div>
          );
        })}

        {/* Bottom spacer for centering last line */}
        <div className="flex-shrink-0 h-[40%]" />
      </div>
    </div>
  );
}

import { memo } from 'react';
import {
  CUT_THUMBNAIL_TILE_WIDTH,
  type CutThumbnailDensity,
  type TimelineClipView,
  type TimelineTrackView,
} from '@neko-cut/domain';
import { Badge } from '@neko/ui/primitives';
import type { ClipRepresentationState } from '../../hooks/useClipRepresentations';
import { useTranslation } from '../../i18n/I18nContext';
import { buildWaveformPath } from './waveform';

export interface TimelineElementContentProps {
  readonly clip: TimelineClipView;
  readonly trackKind: TimelineTrackView['kind'];
  readonly representation?: ClipRepresentationState;
  readonly width: number;
  readonly height: number;
}

export const TimelineElementContent = memo(function TimelineElementContent(
  props: TimelineElementContentProps,
) {
  const { t } = useTranslation();
  const derivedState = props.representation?.status ?? 'idle';
  return (
    <div className="cut-basic-clip-content" data-derived-state={derivedState}>
      {renderDerivedVisual(props)}
      <span className="cut-basic-clip-name">{props.clip.name}</span>
      <span className="cut-basic-clip-duration">
        {props.clip.durationSeconds.toFixed(2)}s
        {props.clip.playbackRate !== 1 ? ` · ${props.clip.playbackRate.toFixed(2)}×` : ''}
      </span>
      <span className="cut-basic-clip-status">
        {!props.clip.enabled ? (
          <Badge title={t('timeline.clip.disabled')} tone="neutral">
            {t('timeline.clip.disabledTag')}
          </Badge>
        ) : null}
        {props.clip.locked ? (
          <Badge title={t('timeline.clip.locked')} tone="neutral">
            {t('timeline.clip.lockedTag')}
          </Badge>
        ) : null}
        {props.clip.audio.muted && props.trackKind !== 'Subtitle' ? (
          <Badge title={t('timeline.clip.muted')} tone="neutral">
            {t('timeline.clip.mutedTag')}
          </Badge>
        ) : null}
      </span>
    </div>
  );
});

function renderDerivedVisual(props: TimelineElementContentProps): React.ReactNode {
  const representation = props.representation;
  if (
    !representation ||
    (representation.status !== 'ready' && representation.status !== 'partial')
  ) {
    return null;
  }
  if (representation.kind === 'thumbnail') {
    return (
      <div
        className="cut-basic-thumbnails"
        data-thumbnail-density={representation.density}
        aria-hidden="true"
      >
        {representation.tiles.map((tile) => {
          if (tile.status !== 'ready') return null;
          const layout = thumbnailTileLayout(props.clip, tile.density, tile.tileIndex, props.width);
          if (!layout) return null;
          return (
            <img
              alt=""
              data-thumbnail-tile-index={tile.tileIndex}
              draggable={false}
              key={`${tile.density}:${tile.tileIndex}`}
              src={tile.dataUrl}
              style={layout}
            />
          );
        })}
      </div>
    );
  }
  const waveformWidth = representation.waveform.partial
    ? Math.max(
        0,
        Math.min(
          props.width,
          props.width *
            (representation.waveform.partial.availableDurationSeconds /
              representation.waveform.durationSeconds),
        ),
      )
    : props.width;
  const path = buildWaveformPath(
    representation.waveform.peaks,
    Math.max(1, waveformWidth),
    Math.max(1, props.height - 8),
  );
  return (
    <svg
      className="cut-basic-waveform"
      aria-hidden="true"
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      <path d={path} />
    </svg>
  );
}

export function thumbnailTileLayout(
  clip: TimelineClipView,
  density: CutThumbnailDensity,
  tileIndex: number,
  clipWidth: number,
): { readonly left: number; readonly width: number } | undefined {
  const tileDurationSeconds = CUT_THUMBNAIL_TILE_WIDTH / density;
  const tileStartSeconds = tileIndex * tileDurationSeconds;
  const intersectionStart = Math.max(tileStartSeconds, clip.startSeconds);
  const intersectionEnd = Math.min(
    tileStartSeconds + tileDurationSeconds,
    clip.startSeconds + clip.durationSeconds,
  );
  if (intersectionEnd <= intersectionStart || clip.durationSeconds <= 0) return undefined;
  return {
    left: ((intersectionStart - clip.startSeconds) / clip.durationSeconds) * clipWidth,
    width: ((intersectionEnd - intersectionStart) / clip.durationSeconds) * clipWidth,
  };
}

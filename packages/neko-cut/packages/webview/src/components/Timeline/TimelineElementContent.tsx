import { memo } from 'react';
import type { TimelineClipView, TimelineTrackView } from '@neko-cut/domain';
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
  if (!representation || representation.status !== 'ready') return null;
  if (representation.kind === 'thumbnail') {
    return (
      <div className="cut-basic-thumbnails" aria-hidden="true">
        {representation.thumbnails.map((thumbnail) => (
          <img
            alt=""
            draggable={false}
            key={`${thumbnail.sourceTimeSeconds}-${thumbnail.dataUrl.length}`}
            src={thumbnail.dataUrl}
          />
        ))}
      </div>
    );
  }
  const path = buildWaveformPath(
    representation.waveform.peaks,
    Math.max(1, props.width),
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

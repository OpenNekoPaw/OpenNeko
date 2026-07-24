/**
 * Adapts the revisioned OTIO TimelineView to the existing property form.
 *
 * The form-specific TimelineElement shape exists only as a controlled draft. It
 * is never persisted and never becomes a second project authority.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { TimelineClipView, TimelineTrackView } from '@neko-cut/domain';
import { SendIcon } from '@neko/ui/icons';
import { PanelSection, PropertyRow, SelectPropertyRow } from '@neko/ui/creative';
import { Button, Checkbox } from '@neko/ui/primitives';
import { ENGINE_DEFAULT_TRANSFORM, type TimelineElement } from '../../types';
import { useCutOtioController } from '../../controllers/CutOtioControllerContext';
import { useTranslation } from '../../i18n/I18nContext';
import {
  useCutPresentationStore,
  type CutPresentationSelection,
} from '../../stores/cut-presentation-store';
import { PropertyPanel } from './PropertyPanel';
import {
  PROJECT_CANVAS_PRESETS,
  projectCanvasCommandForPreset,
  projectCanvasPresetId,
} from './projectCanvasPresets';

export { projectCanvasCommandForPreset } from './projectCanvasPresets';

interface PropertyPanelInlineProps {
  readonly mode: 'basic';
}

export const PropertyPanelInline = memo(function PropertyPanelInline({
  mode,
}: PropertyPanelInlineProps) {
  const controller = useCutOtioController();
  const { t } = useTranslation();
  const view = useCutPresentationStore((state) => state.view);
  const selection = useCutPresentationStore((state) => state.selection);
  const currentTime = useCutPresentationStore((state) => state.playheadSeconds);
  const selected = useMemo(() => findSelectedClip(view?.tracks, selection), [selection, view]);
  const selectedTrack = useMemo(
    () =>
      selection?.kind === 'track'
        ? view?.tracks.find((track) => track.trackId === selection.trackId)
        : undefined,
    [selection, view],
  );
  const selectedGap = useMemo(() => {
    if (selection?.kind !== 'gap') return undefined;
    const track = view?.tracks.find((candidate) => candidate.trackId === selection.trackId);
    const gap = track?.items[selection.itemIndex];
    return track && gap?.kind === 'gap' ? { track, gap } : undefined;
  }, [selection, view]);
  const projected = useMemo(
    () => (selected ? projectClipForPropertyForm(selected.track, selected.clip) : null),
    [selected],
  );
  const [draft, setDraft] = useState<TimelineElement | null>(projected);

  useEffect(() => setDraft(projected), [projected, view?.revision]);

  const previewChange = useCallback((elementId: string, changes: Partial<TimelineElement>) => {
    setDraft((current) =>
      current?.id === elementId ? mergeElementDraft(current, changes) : current,
    );
  }, []);

  const commitChange = useCallback(
    (elementId: string, changes: Partial<TimelineElement>) => {
      if (!selected || selected.clip.clipId !== elementId) return;
      const { clip, track } = selected;
      if (typeof changes.name === 'string' && changes.name !== clip.name) {
        controller.command({ type: 'rename-clip', clipId: clip.clipId, name: changes.name });
        return;
      }
      if (typeof changes.startTime === 'number' && changes.startTime !== clip.startSeconds) {
        controller.command({
          type: 'place-clip',
          clipId: clip.clipId,
          toTrackId: track.trackId,
          timelineStartFrames: Math.round(changes.startTime * frameRate(view)),
          rate: frameRate(view),
          sourcePolicy: 'preserve-gap',
          overlapPolicy: 'reject',
        });
        return;
      }
      const projectedClip =
        draft?.id === elementId ? draft : projectClipForPropertyForm(track, clip);
      if (
        typeof changes.trimStart === 'number' &&
        Math.abs(changes.trimStart - projectedClip.trimStart) > 1e-9
      ) {
        controller.command({
          type: 'trim',
          clipId: clip.clipId,
          startDeltaFrames: Math.round(
            (changes.trimStart - projectedClip.trimStart) * frameRate(view),
          ),
          endDeltaFrames: 0,
        });
        return;
      }
      if (
        typeof changes.trimEnd === 'number' &&
        Math.abs(changes.trimEnd - projectedClip.trimEnd) > 1e-9
      ) {
        controller.command({
          type: 'trim',
          clipId: clip.clipId,
          startDeltaFrames: 0,
          endDeltaFrames: Math.round((changes.trimEnd - projectedClip.trimEnd) * frameRate(view)),
        });
        return;
      }
      if (typeof changes.duration === 'number') {
        const durationSeconds = Math.max(
          frameSeconds(view),
          changes.duration - projectedClip.trimStart - projectedClip.trimEnd,
        );
        if (Math.abs(durationSeconds - clip.durationSeconds) > 1e-9) {
          controller.command({
            type: 'set-clip-duration',
            clipId: clip.clipId,
            durationFrames: Math.max(1, Math.round(durationSeconds * frameRate(view))),
            rate: frameRate(view),
          });
        }
        return;
      }
      if (changes.speed && changes.speed.speed !== clip.playbackRate) {
        controller.command({
          type: 'set-playback-rate',
          clipId: clip.clipId,
          playbackRate: changes.speed.speed,
        });
        return;
      }
      if (changes.audio) {
        controller.command({
          type: 'set-audio',
          clipId: clip.clipId,
          settings: {
            muted: changes.audio.muted,
            gainDb: changes.audio.gain,
            fadeInSeconds: changes.audio.fadeIn,
            fadeOutSeconds: changes.audio.fadeOut,
          },
        });
      }
    },
    [controller, draft, selected, view],
  );

  if (selectedTrack) {
    return (
      <div className="cut-basic-inspector-content">
        <div className="nk-prop-panel cut-shared-property-panel">
          <PanelSection
            className="cut-inspector-group"
            density="compact"
            title={t('propertyPanel.group.basic')}
          >
            <PropertyRow
              density="compact"
              label={t('propertyPanel.basic.name')}
              propertyId="track.name"
            >
              <input
                aria-label={t('propertyPanel.basic.name')}
                className="cut-shared-text-input"
                defaultValue={selectedTrack.name}
                key={`${selectedTrack.trackId}:${view?.revision ?? 0}`}
                onBlur={(event) =>
                  controller.command({
                    type: 'rename-track',
                    trackId: selectedTrack.trackId,
                    name: event.currentTarget.value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  controller.command({
                    type: 'rename-track',
                    trackId: selectedTrack.trackId,
                    name: event.currentTarget.value,
                  });
                }}
                type="text"
              />
            </PropertyRow>
          </PanelSection>
          <PanelSection
            className="cut-inspector-group"
            density="compact"
            title={t('propertyPanel.group.state')}
          >
            <PropertyRow
              density="compact"
              label={t('propertyPanel.track.enabled')}
              propertyId="track.enabled"
            >
              <Checkbox
                aria-label={t('propertyPanel.track.enabled')}
                checked={selectedTrack.enabled}
                onCheckedChange={(enabled) =>
                  controller.command({
                    type: 'set-track-enabled',
                    trackId: selectedTrack.trackId,
                    enabled,
                  })
                }
              />
            </PropertyRow>
            <PropertyRow
              density="compact"
              label={t('propertyPanel.track.locked')}
              propertyId="track.locked"
            >
              <Checkbox
                aria-label={t('propertyPanel.track.locked')}
                checked={selectedTrack.locked}
                onCheckedChange={(locked) =>
                  controller.command({
                    type: 'set-track-locked',
                    trackId: selectedTrack.trackId,
                    locked,
                  })
                }
              />
            </PropertyRow>
            {selectedTrack.kind !== 'Subtitle' ? (
              <PropertyRow
                density="compact"
                label={t('propertyPanel.track.muted')}
                propertyId="track.muted"
              >
                <Checkbox
                  aria-label={t('propertyPanel.track.muted')}
                  checked={selectedTrack.audioMuted}
                  onCheckedChange={(muted) =>
                    controller.command({
                      type: 'set-track-muted',
                      trackId: selectedTrack.trackId,
                      muted,
                    })
                  }
                />
              </PropertyRow>
            ) : null}
          </PanelSection>
        </div>
        <div className="cut-basic-inspector-actions">
          <Button
            leadingIcon={<SendIcon size={14} />}
            onClick={() =>
              controller.sendToAgent({ kind: 'track', trackId: selectedTrack.trackId })
            }
            size="sm"
            variant="secondary"
          >
            {t('timeline.contextMenu.sendToAgent')}
          </Button>
        </div>
      </div>
    );
  }

  if (selectedGap) {
    return (
      <ReadOnlyInspector
        groups={[
          {
            title: t('propertyPanel.group.location'),
            rows: [[t('propertyPanel.context.track'), selectedGap.track.name]],
          },
          {
            title: t('propertyPanel.group.range'),
            rows: [
              [t('propertyPanel.basic.startTime'), formatSeconds(selectedGap.gap.startSeconds)],
              [t('propertyPanel.basic.duration'), formatSeconds(selectedGap.gap.durationSeconds)],
            ],
          },
        ]}
      />
    );
  }

  if (!selected && view) {
    const frameRateValue = frameRate(view);
    const profile = view.profile;
    return (
      <div className="cut-basic-inspector-content">
        <div className="nk-prop-panel cut-shared-property-panel">
          <PanelSection
            className="cut-inspector-group"
            density="compact"
            title={t('propertyPanel.group.canvas')}
          >
            {profile ? (
              <SelectPropertyRow
                density="compact"
                id="project.canvasPreset"
                label={t('propertyPanel.project.canvasPreset')}
                onCommit={(_, presetId) =>
                  controller.command(projectCanvasCommandForPreset(presetId))
                }
                options={[
                  ...PROJECT_CANVAS_PRESETS.map((preset) => ({
                    value: preset.id,
                    label: t(preset.labelKey),
                  })),
                  ...(projectCanvasPresetId(profile) === 'custom'
                    ? [
                        {
                          value: 'custom',
                          label: t('propertyPanel.project.preset.custom', {
                            width: profile.width,
                            height: profile.height,
                          }),
                          disabled: true,
                        },
                      ]
                    : []),
                ]}
                value={projectCanvasPresetId(profile)}
              />
            ) : null}
            <ReadOnlyPropertyRow
              label={t('propertyPanel.project.resolution')}
              propertyId="project.resolution"
              value={profile ? `${profile.width} × ${profile.height}` : '—'}
            />
          </PanelSection>
          <PanelSection
            className="cut-inspector-group"
            density="compact"
            title={t('propertyPanel.group.timeline')}
          >
            <ReadOnlyPropertyRow
              label={t('propertyPanel.basic.name')}
              propertyId="project.name"
              value={view.name}
            />
            <ReadOnlyPropertyRow
              label={t('propertyPanel.project.frameRate')}
              propertyId="project.frameRate"
              value={`${frameRateValue.toFixed(2)} fps`}
            />
            <ReadOnlyPropertyRow
              label={t('propertyPanel.basic.duration')}
              propertyId="project.duration"
              value={formatSeconds(view.durationSeconds)}
            />
            <ReadOnlyPropertyRow
              label={t('propertyPanel.project.tracks')}
              propertyId="project.tracks"
              value={String(view.tracks.length)}
            />
          </PanelSection>
        </div>
      </div>
    );
  }

  return (
    <div className="cut-basic-inspector-content">
      <PropertyPanel
        mode={mode}
        element={draft}
        currentTime={currentTime}
        onElementChange={previewChange}
        onElementCommit={commitChange}
      />
      {selected ? (
        <div className="cut-basic-inspector-actions">
          {selected.track.kind === 'Video' ? (
            <Button
              onClick={() =>
                selected.clip.linkedAudioClipId
                  ? controller.command({
                      type: 'unseparate-audio',
                      videoClipId: selected.clip.clipId,
                    })
                  : controller.separateAudio(selected.clip.clipId)
              }
              size="sm"
              variant="secondary"
            >
              {selected.clip.linkedAudioClipId
                ? t('timeline.contextMenu.unseparateAudio')
                : t('timeline.contextMenu.separateAudio')}
            </Button>
          ) : null}
          <Button
            leadingIcon={<SendIcon size={14} />}
            onClick={() =>
              controller.sendToAgent({
                kind: 'clip',
                trackId: selected.track.trackId,
                clipId: selected.clip.clipId,
              })
            }
            size="sm"
            variant="secondary"
          >
            {t('timeline.contextMenu.sendToAgent')}
          </Button>
        </div>
      ) : null}
    </div>
  );
});

function ReadOnlyInspector(props: {
  readonly groups: readonly {
    readonly title: string;
    readonly rows: readonly (readonly [label: string, value: string])[];
  }[];
}) {
  return (
    <div className="cut-basic-inspector-content">
      <div className="nk-prop-panel cut-shared-property-panel">
        {props.groups.map((group) => (
          <PanelSection
            className="cut-inspector-group"
            density="compact"
            key={group.title}
            title={group.title}
          >
            {group.rows.map(([label, value]) => (
              <PropertyRow density="compact" key={label} label={label} propertyId={label}>
                <span className="cut-basic-property-value">{value}</span>
              </PropertyRow>
            ))}
          </PanelSection>
        ))}
      </div>
    </div>
  );
}

function ReadOnlyPropertyRow(props: {
  readonly label: string;
  readonly propertyId: string;
  readonly value: string;
}) {
  return (
    <PropertyRow density="compact" label={props.label} propertyId={props.propertyId}>
      <output className="cut-basic-property-value">{props.value}</output>
    </PropertyRow>
  );
}

function findSelectedClip(
  tracks: readonly TimelineTrackView[] | undefined,
  selection: CutPresentationSelection | undefined,
): { readonly track: TimelineTrackView; readonly clip: TimelineClipView } | undefined {
  if (!tracks || selection?.kind !== 'clip') return undefined;
  const track = tracks.find((candidate) => candidate.trackId === selection.trackId);
  const clip = track?.items.find(
    (candidate) => candidate.kind === 'clip' && candidate.clipId === selection.clipId,
  );
  return track && clip?.kind === 'clip' ? { track, clip } : undefined;
}

export function projectClipForPropertyForm(
  track: TimelineTrackView,
  clip: TimelineClipView,
): TimelineElement {
  const availableStart = clip.sourceAvailableStartSeconds;
  const availableDuration = clip.sourceAvailableDurationSeconds;
  const trimStart =
    availableStart !== undefined && availableDuration !== undefined
      ? Math.max(0, (clip.sourceStartSeconds - availableStart) / clip.playbackRate)
      : 0;
  const trimEnd =
    availableStart !== undefined && availableDuration !== undefined
      ? Math.max(
          0,
          (availableStart +
            availableDuration -
            clip.sourceStartSeconds -
            clip.durationSeconds * clip.playbackRate) /
            clip.playbackRate,
        )
      : 0;
  const common = {
    id: clip.clipId,
    name: clip.name,
    duration: trimStart + clip.durationSeconds + trimEnd,
    startTime: clip.startSeconds,
    trimStart,
    trimEnd,
    transform: ENGINE_DEFAULT_TRANSFORM,
    opacity: 1,
    blendMode: 'normal' as const,
    effects: [],
    muted: clip.audio.muted,
    hidden: !clip.enabled || !track.enabled,
    locked: clip.locked || track.locked,
    audio: {
      volume: 1,
      pan: 0,
      muted: clip.audio.muted,
      fadeIn: clip.audio.fadeInSeconds,
      fadeOut: clip.audio.fadeOutSeconds,
      gain: clip.audio.gainDb,
    },
    speed: {
      speed: clip.playbackRate,
      preservePitch: true,
      reverse: false,
    },
  };
  if (track.kind === 'Audio') return { ...common, type: 'audio', src: clip.targetUrl };
  if (track.kind === 'Subtitle') {
    return {
      ...common,
      type: 'subtitle',
      text: clip.name,
      fontSize: 48,
      fontFamily: 'Arial',
      color: '#ffffff',
      backgroundColor: 'transparent',
      textAlign: 'center',
      strokeColor: 'transparent',
      strokeWidth: 0,
    };
  }
  return {
    ...common,
    type: 'media',
    src: clip.targetUrl,
    mediaType: 'video',
    ...(clip.linkedAudioClipId ? { linkedAudioId: clip.linkedAudioClipId } : {}),
  };
}

function frameRate(
  view:
    | {
        readonly profile?: {
          readonly editRateNumerator: number;
          readonly editRateDenominator: number;
        };
      }
    | undefined,
): number {
  return view?.profile ? view.profile.editRateNumerator / view.profile.editRateDenominator : 30;
}

function frameSeconds(view: Parameters<typeof frameRate>[0]): number {
  return 1 / frameRate(view);
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

function mergeElementDraft(
  current: TimelineElement,
  changes: Partial<TimelineElement>,
): TimelineElement {
  return Object.assign({}, current, changes);
}

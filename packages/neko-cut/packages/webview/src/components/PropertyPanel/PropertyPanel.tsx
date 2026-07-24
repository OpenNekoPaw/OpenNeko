import { memo, useCallback } from 'react';
import { NumberPropertyRow, PanelSection, PropertyRow, SliderPropertyRow } from '@neko/ui/creative';
import { Checkbox } from '@neko/ui/primitives';
import { useTranslation } from '../../i18n/I18nContext';
import type { TimelineElement } from '../../types';

export interface PropertyPanelProps {
  readonly mode: 'basic';
  readonly element: TimelineElement | null;
  readonly currentTime: number;
  readonly onElementChange: (elementId: string, changes: Partial<TimelineElement>) => void;
  readonly onElementCommit?: (elementId: string, changes: Partial<TimelineElement>) => void;
}

export const PropertyPanel = memo(function PropertyPanel(props: PropertyPanelProps) {
  const { t } = useTranslation();
  const { element, onElementChange, onElementCommit } = props;
  const disabled = !element;
  const preview = useCallback(
    (changes: Partial<TimelineElement>) => {
      if (element) onElementChange(element.id, changes);
    },
    [element, onElementChange],
  );
  const commit = useCallback(
    (changes: Partial<TimelineElement>) => {
      if (element) onElementCommit?.(element.id, changes);
    },
    [element, onElementCommit],
  );

  if (!element) {
    return (
      <div className="nk-prop-panel cut-shared-property-panel">
        <div className="cut-basic-property-empty">{t('propertyPanel.noSelection')}</div>
      </div>
    );
  }

  const effectiveDuration = Math.max(0.01, element.duration - element.trimStart - element.trimEnd);
  const audio = element.audio;
  const playbackRate = element.speed?.speed ?? 1;

  return (
    <div className="nk-prop-panel cut-shared-property-panel">
      <PanelSection
        className="cut-inspector-group"
        density="compact"
        disabled={disabled}
        title={t('propertyPanel.group.basic')}
      >
        <PropertyRow
          density="compact"
          disabled={disabled}
          label={t('propertyPanel.basic.name')}
          propertyId="name"
        >
          <input
            aria-label={t('propertyPanel.basic.name')}
            className="cut-shared-text-input"
            disabled={disabled}
            onBlur={(event) => commit({ name: event.currentTarget.value })}
            onChange={(event) => preview({ name: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit({ name: event.currentTarget.value });
            }}
            type="text"
            value={element.name}
          />
        </PropertyRow>
      </PanelSection>

      <PanelSection
        className="cut-inspector-group"
        density="compact"
        disabled={disabled}
        title={t('propertyPanel.group.timing')}
      >
        <NumberPropertyRow
          density="compact"
          disabled={disabled}
          id="startTime"
          label={t('propertyPanel.basic.startTime')}
          min={0}
          onCommit={(_, value) => commit({ startTime: value })}
          onPreviewChange={(_, value) => preview({ startTime: value })}
          step={0.01}
          unit="s"
          value={element.startTime}
        />
        <NumberPropertyRow
          density="compact"
          disabled={disabled}
          id="duration"
          label={t('propertyPanel.basic.duration')}
          min={0.01}
          onCommit={(_, value) => commit({ duration: value + element.trimStart + element.trimEnd })}
          onPreviewChange={(_, value) =>
            preview({ duration: value + element.trimStart + element.trimEnd })
          }
          step={0.01}
          unit="s"
          value={effectiveDuration}
        />
        <NumberPropertyRow
          density="compact"
          disabled={disabled}
          id="trimStart"
          label={t('propertyPanel.basic.trimStart')}
          min={0}
          onCommit={(_, value) => commit({ trimStart: value })}
          onPreviewChange={(_, value) => preview({ trimStart: value })}
          step={0.01}
          unit="s"
          value={element.trimStart}
        />
        <NumberPropertyRow
          density="compact"
          disabled={disabled}
          id="trimEnd"
          label={t('propertyPanel.basic.trimEnd')}
          min={0}
          onCommit={(_, value) => commit({ trimEnd: value })}
          onPreviewChange={(_, value) => preview({ trimEnd: value })}
          step={0.01}
          unit="s"
          value={element.trimEnd}
        />
      </PanelSection>

      {element.type !== 'subtitle' ? (
        <PanelSection
          className="cut-inspector-group"
          density="compact"
          disabled={disabled}
          title={t('propertyPanel.group.speed')}
        >
          <SliderPropertyRow
            density="compact"
            disabled={disabled}
            id="speed"
            label={t('speed.playbackSpeed')}
            min={0.25}
            max={4}
            onCommit={(_, speed) => commit({ speed: constantSpeed(element, speed) })}
            onPreviewChange={(_, speed) => preview({ speed: constantSpeed(element, speed) })}
            step={0.05}
            unit="×"
            value={playbackRate}
          />
        </PanelSection>
      ) : null}

      {audio && element.type !== 'subtitle' ? (
        <PanelSection
          className="cut-inspector-group"
          density="compact"
          disabled={disabled}
          title={t('propertyPanel.group.audio')}
        >
          <PropertyRow
            density="compact"
            disabled={disabled}
            label={t('propertyPanel.audio.muted')}
            propertyId="audio.muted"
          >
            <Checkbox
              checked={audio.muted}
              disabled={disabled}
              onCheckedChange={(muted) => {
                const changes = { audio: { ...audio, muted } };
                preview(changes);
                commit(changes);
              }}
            />
          </PropertyRow>
          <SliderPropertyRow
            density="compact"
            disabled={disabled}
            id="audio.gain"
            label={t('propertyPanel.audio.gain')}
            min={-20}
            max={20}
            onCommit={(_, gain) => commit({ audio: { ...audio, gain } })}
            onPreviewChange={(_, gain) => preview({ audio: { ...audio, gain } })}
            step={0.5}
            unit="dB"
            value={audio.gain}
          />
          <NumberPropertyRow
            density="compact"
            disabled={disabled}
            id="audio.fadeIn"
            label={t('propertyPanel.audio.fadeIn')}
            min={0}
            max={10}
            onCommit={(_, fadeIn) => commit({ audio: { ...audio, fadeIn } })}
            onPreviewChange={(_, fadeIn) => preview({ audio: { ...audio, fadeIn } })}
            step={0.1}
            unit="s"
            value={audio.fadeIn}
          />
          <NumberPropertyRow
            density="compact"
            disabled={disabled}
            id="audio.fadeOut"
            label={t('propertyPanel.audio.fadeOut')}
            min={0}
            max={10}
            onCommit={(_, fadeOut) => commit({ audio: { ...audio, fadeOut } })}
            onPreviewChange={(_, fadeOut) => preview({ audio: { ...audio, fadeOut } })}
            step={0.1}
            unit="s"
            value={audio.fadeOut}
          />
        </PanelSection>
      ) : null}
    </div>
  );
});

function constantSpeed(element: TimelineElement, speed: number) {
  return {
    speed,
    preservePitch: element.speed?.preservePitch ?? true,
    reverse: false,
  };
}

import { TimelineRuler } from '@neko/ui/creative';
import { CreativeHostAdapterFrame, type CreativeHostAdapterSurfaceProps } from '@neko/ui/workbench';
import type { ReactElement } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function CutHostAdapterSurface({
  document,
  locale,
  onIntent,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  return (
    <CreativeHostAdapterFrame
      className="cut-host-adapter"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="preview-timeline"
      main={
        <div className="cut-host-adapter__surface" data-creative-panel="cut-timeline">
          <div className="cut-host-adapter__preview" />
          <div className="cut-host-adapter__transport">
            <button
              type="button"
              title={t('timeline.contextMenu.cut')}
              onClick={() => onIntent('inspect')}
            >
              {iconGlyph('CUT')}
            </button>
            <button
              type="button"
              title={t('timeline.controls.play')}
              onClick={() => onIntent('play')}
            >
              {iconGlyph('PLY')}
            </button>
            <button
              type="button"
              title={t('timeline.controls.pause')}
              onClick={() => onIntent('pause')}
            >
              {iconGlyph('PAU')}
            </button>
            <span>00:00.00 / 02:23.04</span>
            <button
              type="button"
              title={t('timeline.controls.export')}
              onClick={() => onIntent('activate')}
            >
              {iconGlyph('EXP')}
            </button>
          </div>
        </div>
      }
      bottomPanel={<CutTimelineProjection name={document.name} />}
    />
  );
}

function CutTimelineProjection({ name }: { readonly name: string }): ReactElement {
  return (
    <div className="cut-host-adapter__tracks">
      <TimelineRuler duration={143} pixelsPerSecond={18} height={28} onSeek={() => undefined} />
      <div className="cut-host-adapter__track cut-host-adapter__track--video">V1 {name}</div>
      <div className="cut-host-adapter__track cut-host-adapter__track--audio">A1 {name}</div>
    </div>
  );
}

function iconGlyph(label: string): ReactElement {
  return <span className="cut-host-adapter__icon">{label}</span>;
}

function adapterInspectorLabels(runtimeLabel: string) {
  return {
    dock: t('hostAdapter.dock', { label: runtimeLabel }),
    packageName: t('hostAdapter.package'),
    panel: t('hostAdapter.panel'),
    runtime: t('hostAdapter.runtime'),
    file: t('hostAdapter.file'),
  };
}

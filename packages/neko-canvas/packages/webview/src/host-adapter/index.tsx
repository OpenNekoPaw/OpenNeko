import {
  CreativeHostAdapterFrame,
  CreativeLeftRail,
  type CreativeHostAdapterSurfaceProps,
} from '@neko/ui/workbench';
import type { ReactElement, ReactNode } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function CanvasHostAdapterSurface({
  document,
  locale,
  onIntent,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  return (
    <CreativeHostAdapterFrame
      className="canvas-host-adapter"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="canvas"
      leftRail={
        <CreativeLeftRail
          label={t('toolbar.leftRail')}
          actions={[
            adapterAction('select', t('toolbar.selectTool'), 'SEL', () => onIntent('focus')),
            adapterAction('layers', t('toolbar.layers'), 'LYR', () => onIntent('inspect')),
            adapterAction('export', t('toolbar.export'), 'EXP', () => onIntent('activate')),
          ]}
          bottomActions={[
            adapterAction('settings', t('settings.title'), 'SET', () => onIntent('inspect')),
          ]}
        />
      }
      main={
        <div className="canvas-host-adapter__surface" data-creative-panel="canvas-workbench">
          <div className="canvas-host-adapter__node canvas-host-adapter__node--source">
            {document.name}
          </div>
          <div className="canvas-host-adapter__node canvas-host-adapter__node--generate">
            {t('gallery.column.prompt')}
          </div>
          <div className="canvas-host-adapter__node canvas-host-adapter__node--preview">
            {t('preset.media.preview')}
          </div>
        </div>
      }
    />
  );
}

function adapterAction(id: string, label: string, icon: string, onClick: () => void) {
  return {
    id,
    kind: 'common-action' as const,
    label,
    icon: iconGlyph(icon),
    onClick,
  };
}

function iconGlyph(label: string): ReactNode {
  return <span className="canvas-host-adapter__icon">{label}</span>;
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

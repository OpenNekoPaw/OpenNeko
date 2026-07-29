import {
  CreativeHostAdapterFrame,
  CreativeLeftRail,
  type CreativeHostAdapterSurfaceProps,
} from '@neko/ui/workbench';
import type { ReactElement } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function PreviewHostAdapterSurface({
  document,
  locale,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  const url = document.resourceUrl;
  return (
    <CreativeHostAdapterFrame
      className="preview-host-adapter-frame"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="viewport-timeline"
      leftRail={<CreativeLeftRail label={t('preview.hostAdapter.tools')} />}
      main={
        <div className="preview-host-adapter" data-creative-panel="media-preview">
          {document.kind === 'image' && url ? <img src={url} alt={document.name} /> : null}
          {document.kind === 'video' && url ? (
            <video src={url} muted controls preload="metadata" />
          ) : null}
          {document.kind === 'audio' && url ? <audio src={url} controls /> : null}
          <p>{document.relativePath}</p>
        </div>
      }
    />
  );
}

function adapterInspectorLabels(runtimeLabel: string) {
  return {
    dock: t('preview.hostAdapter.dock', { label: runtimeLabel }),
    packageName: t('preview.hostAdapter.package'),
    panel: t('preview.hostAdapter.panel'),
    runtime: t('preview.hostAdapter.runtime'),
    file: t('preview.hostAdapter.file'),
  };
}

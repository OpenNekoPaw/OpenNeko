import type { AssetCenterSessionProjection } from '@neko/assets-domain/asset-center/contract';
import type { SupportedLocale } from '@neko/ui/i18n';
import type { ReactElement } from 'react';

export function AssetCenterMainRoot({
  locale,
  projection,
  renderPreview,
}: {
  readonly locale: SupportedLocale;
  readonly projection: AssetCenterSessionProjection;
  readonly renderPreview: (previewSessionId: string) => ReactElement;
}): ReactElement {
  const preview = projection.preview;
  return (
    <section
      className="asset-center-main"
      data-asset-center-main-session-id={projection.identity.assetCenterSessionId}
    >
      {preview.status === 'ready' ? (
        renderPreview(preview.previewSessionId)
      ) : preview.status === 'unavailable' ? (
        <div className="global-library-browser__diagnostic" role="status">
          <strong>{label(locale, '预览不可用', 'Preview unavailable')}</strong>
          <span>{preview.diagnostic.message}</span>
        </div>
      ) : preview.status === 'loading' ? (
        <div className="global-library-browser__loading" role="status">
          {label(locale, '正在载入预览', 'Loading preview')}
        </div>
      ) : (
        <div className="global-library-browser__empty">
          {label(locale, '选择资源以预览', 'Select a resource to preview')}
        </div>
      )}
    </section>
  );
}

function label(locale: SupportedLocale, chinese: string, english: string): string {
  return locale.toLocaleLowerCase().startsWith('zh') ? chinese : english;
}

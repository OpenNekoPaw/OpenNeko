import type { AssetCenterSessionProjection } from '@neko/assets-domain/asset-center/contract';
import { lazy, Suspense } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import { DesktopAuthorizedPreviewSurface } from './DesktopAuthorizedPreviewSurface';

const AssetCenterMainRoot = lazy(async () => {
  const module = await import('@neko/assets-webview/asset-management/main-root');
  return { default: module.AssetCenterMainRoot };
});

export function DesktopAssetCenterMainSurface({
  projection,
  rendererSessionId,
}: {
  readonly projection: AssetCenterSessionProjection;
  readonly rendererSessionId: string;
}): JSX.Element {
  const { locale } = useTranslation();
  return (
    <Suspense fallback={null}>
      <AssetCenterMainRoot
        locale={locale}
        projection={projection}
        renderPreview={(previewSessionId) => (
          <DesktopAuthorizedPreviewSurface
            bridge={window.openNekoDesktop}
            previewSessionId={previewSessionId}
            projection={projection}
            rendererSessionId={rendererSessionId}
          />
        )}
      />
    </Suspense>
  );
}

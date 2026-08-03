import type { AssetCenterManagementRuntime } from '@neko/assets-domain/asset-center/controller';
import { lazy, Suspense } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';

const AssetManagementRoot = lazy(async () => {
  const module = await import('@neko/assets-webview/asset-management/root');
  return { default: module.AssetManagementRoot };
});

export function DesktopAssetManagementSurface({
  interactive,
  runtime,
}: {
  readonly interactive: boolean;
  readonly runtime: AssetCenterManagementRuntime;
}): JSX.Element {
  const { locale } = useTranslation();
  return (
    <div className="desktop-asset-management-root">
      <Suspense fallback={null}>
        <AssetManagementRoot
          runtime={runtime}
          locale={locale}
          interactive={interactive}
          confirmAction={(message) => window.confirm(message)}
        />
      </Suspense>
    </div>
  );
}

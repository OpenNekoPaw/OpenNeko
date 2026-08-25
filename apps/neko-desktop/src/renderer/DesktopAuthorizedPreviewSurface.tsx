import type { AssetCenterSessionProjection } from '@neko/assets-domain/asset-center/contract';
import {
  createAssetCenterHostRequest,
  type OpenNekoAssetCenterBridge,
} from '@neko/assets-domain/asset-center/host-contract';
import type {
  AuthorizedPreviewSessionIdentity,
  AuthorizedPreviewSessionProjection,
  AuthorizedPreviewSessionRuntime,
} from '@neko/preview-domain/authorized-session';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import { usePreviewViewerSnapshotStore } from '@neko/preview-webview/presentation-snapshot';

const AuthorizedPreviewRoot = lazy(async () => {
  const module = await import('@neko/preview-webview/root');
  return { default: module.AuthorizedPreviewRoot };
});

export function DesktopAuthorizedPreviewSurface({
  bridge,
  previewSessionId,
  projection,
  rendererSessionId,
}: {
  readonly bridge: OpenNekoAssetCenterBridge;
  readonly previewSessionId: string;
  readonly projection: AssetCenterSessionProjection;
  readonly rendererSessionId: string;
}): JSX.Element {
  const { locale } = useTranslation();
  const snapshotStore = usePreviewViewerSnapshotStore();
  const selection = projection.selection;
  if (!selection || projection.preview.status !== 'ready') {
    throw new Error('Authorized Preview requires an exact Asset Center selection.');
  }
  const runtime = useMemo(
    () =>
      new DesktopAuthorizedPreviewRuntime(
        {
          previewSessionId,
          windowId: projection.identity.windowId,
          owner: {
            kind: 'asset-center',
            assetCenterSessionId: projection.identity.assetCenterSessionId,
            resourceOwner: selection.owner,
            itemId: selection.itemId,
          },
        },
        rendererSessionId,
        bridge,
      ),
    [
      bridge,
      previewSessionId,
      projection.identity.assetCenterSessionId,
      projection.identity.windowId,
      rendererSessionId,
      selection.itemId,
      selection.owner,
    ],
  );
  return (
    <Suspense fallback={null}>
      <AuthorizedPreviewRoot
        chrome="content-only"
        lifecyclePresentation="active"
        locale={locale}
        runtime={runtime}
        snapshotStore={snapshotStore}
      />
    </Suspense>
  );
}

class DesktopAuthorizedPreviewRuntime implements AuthorizedPreviewSessionRuntime {
  constructor(
    readonly identity: AuthorizedPreviewSessionIdentity,
    private readonly rendererSessionId: string,
    private readonly bridge: OpenNekoAssetCenterBridge,
  ) {}

  async getSnapshot(): Promise<AuthorizedPreviewSessionProjection> {
    if (this.identity.owner.kind !== 'asset-center') {
      throw new Error('Asset Center Preview runtime requires an Asset Center owner.');
    }
    const request = createAssetCenterHostRequest({
      requestId: crypto.randomUUID(),
      rendererSessionId: this.rendererSessionId,
      identity: {
        assetCenterSessionId: this.identity.owner.assetCenterSessionId,
        windowId: this.identity.windowId,
      },
      route: 'preview.get',
      previewSessionId: this.identity.previewSessionId,
    });
    const result = await this.bridge.assetCenter.execute(request);
    if (result.route !== 'preview.get') {
      throw new Error('Authorized Preview request returned an Asset Center projection.');
    }
    assertIdentity(this.identity, result.preview.identity);
    return result.preview;
  }

  subscribe(_listener: (projection: AuthorizedPreviewSessionProjection) => void): () => void {
    return () => undefined;
  }
}

function assertIdentity(
  expected: AuthorizedPreviewSessionIdentity,
  actual: AuthorizedPreviewSessionIdentity,
): void {
  if (expected.owner.kind !== 'asset-center' || actual.owner.kind !== 'asset-center') {
    throw new Error('Asset Center Preview identity requires Asset Center owners.');
  }
  if (
    expected.previewSessionId !== actual.previewSessionId ||
    expected.windowId !== actual.windowId ||
    expected.owner.assetCenterSessionId !== actual.owner.assetCenterSessionId ||
    expected.owner.resourceOwner !== actual.owner.resourceOwner ||
    expected.owner.itemId !== actual.owner.itemId
  ) {
    throw new Error('Authorized Preview identity is stale.');
  }
}

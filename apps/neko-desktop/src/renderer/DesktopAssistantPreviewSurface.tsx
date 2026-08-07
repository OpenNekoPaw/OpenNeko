import {
  type AssistantResourceIdentity,
  type OpenNekoAssistantResourceBridge,
} from '@neko/agent-contracts/assistant-resource-host';
import type {
  AuthorizedPreviewSessionIdentity,
  AuthorizedPreviewSessionProjection,
  AuthorizedPreviewSessionRuntime,
} from '@neko/preview-domain/authorized-session';
import { useTranslation } from '@neko/ui/i18n/react';
import { usePreviewViewerSnapshotStore } from '@neko/preview-webview/presentation-snapshot';
import { lazy, Suspense, useMemo } from 'react';

const AuthorizedPreviewRoot = lazy(async () => {
  const module = await import('@neko/preview-webview/root');
  return { default: module.AuthorizedPreviewRoot };
});

export function DesktopAssistantPreviewSurface({
  assistantSpaceId,
  conversationId,
  previewSessionId,
  scratchArtifactId,
  windowId,
}: {
  readonly assistantSpaceId: string;
  readonly conversationId: string;
  readonly previewSessionId: string;
  readonly scratchArtifactId: string;
  readonly windowId: string;
}): JSX.Element {
  const { locale } = useTranslation();
  const snapshotStore = usePreviewViewerSnapshotStore();
  const resourceIdentity = useMemo(
    () => ({ assistantSpaceId, conversationId, windowId }),
    [assistantSpaceId, conversationId, windowId],
  );
  const runtime = useMemo(
    () =>
      new DesktopAssistantAuthorizedPreviewRuntime(
        previewSessionId,
        scratchArtifactId,
        resourceIdentity,
        window.openNekoDesktop,
      ),
    [previewSessionId, resourceIdentity, scratchArtifactId],
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

class DesktopAssistantAuthorizedPreviewRuntime implements AuthorizedPreviewSessionRuntime {
  readonly identity: AuthorizedPreviewSessionIdentity;

  constructor(
    previewSessionId: string,
    scratchArtifactId: string,
    private readonly resourceIdentity: AssistantResourceIdentity,
    private readonly bridge: OpenNekoAssistantResourceBridge,
  ) {
    this.identity = {
      previewSessionId,
      windowId: resourceIdentity.windowId,
      owner: {
        kind: 'assistant-scratch',
        assistantSpaceId: resourceIdentity.assistantSpaceId,
        conversationId: resourceIdentity.conversationId,
        scratchArtifactId,
      },
    };
  }

  async getSnapshot(): Promise<AuthorizedPreviewSessionProjection> {
    const request = {
      requestId: crypto.randomUUID(),
      identity: this.resourceIdentity,
      route: 'preview.get' as const,
      previewSessionId: this.identity.previewSessionId,
    };
    const result = await this.bridge.assistantResources.execute(request);
    if (result.route !== 'preview.get') {
      throw new Error('Assistant Preview snapshot returned another route.');
    }
    const owner = result.preview.identity.owner;
    if (
      result.preview.identity.previewSessionId !== this.identity.previewSessionId ||
      result.preview.identity.windowId !== this.resourceIdentity.windowId ||
      owner.kind !== 'assistant-scratch' ||
      owner.assistantSpaceId !== this.resourceIdentity.assistantSpaceId ||
      owner.conversationId !== this.resourceIdentity.conversationId
    ) {
      throw new Error('Assistant Preview snapshot identity is stale.');
    }
    return result.preview;
  }

  subscribe(_listener: (projection: AuthorizedPreviewSessionProjection) => void): () => void {
    return () => undefined;
  }
}

import {
  PREVIEW_HOST_RUNTIME_VERSION,
  type PreviewHostRuntime,
  type PreviewRuntimeIdentity,
} from '@neko-preview/domain';
import type { OpenNekoDesktopPreviewBridge } from '../shared/preview-bridge-contract';
import { createDesktopPreviewBootstrapRequest } from '../shared/preview-bridge-contract';

export function createElectronPreviewHostRuntime(input: {
  readonly bridge: OpenNekoDesktopPreviewBridge;
  readonly identity: PreviewRuntimeIdentity;
}): PreviewHostRuntime {
  let requestSequence = 0;
  return {
    identity: input.identity,
    getSnapshot() {
      requestSequence += 1;
      return input.bridge.preview.getSnapshot(
        createDesktopPreviewBootstrapRequest({
          requestId: `desktop-preview-snapshot-${requestSequence}`,
          projectId: input.identity.projectId,
          workspaceId: input.identity.workspaceId,
          viewId: input.identity.viewId,
          viewEpoch: input.identity.viewEpoch,
          sessionId: input.identity.sessionId,
          endpointEpoch: input.identity.endpointEpoch,
        }),
      );
    },
    async execute(request) {
      if (request.schemaVersion !== PREVIEW_HOST_RUNTIME_VERSION) {
        throw new Error(`Desktop Preview route '${request.route}' uses an unsupported version.`);
      }
      return input.bridge.preview.execute(request);
    },
    subscribe() {
      return () => undefined;
    },
  };
}

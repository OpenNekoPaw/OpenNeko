interface PreviewMessagePort {
  postMessage(message: unknown): void;
}
import type { PreviewDelegateRequest } from './types';

export function dispatchPreviewDelegate(
  hostPort: PreviewMessagePort | undefined,
  request: PreviewDelegateRequest,
): void {
  if (!hostPort) {
    return;
  }

  hostPort.postMessage({
    type: 'preview:delegateAction',
    action: request.action,
    asset: request.asset,
  });
}

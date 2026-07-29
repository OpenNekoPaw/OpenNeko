interface PreviewMessagePort {
  postMessage(message: unknown): void;
}
import type { PreviewDelegateRequest } from './types';

export function dispatchPreviewDelegate(
  vscode: PreviewMessagePort | undefined,
  request: PreviewDelegateRequest,
): void {
  if (!vscode) {
    return;
  }

  vscode.postMessage({
    type: 'preview:delegateAction',
    action: request.action,
    asset: request.asset,
  });
}

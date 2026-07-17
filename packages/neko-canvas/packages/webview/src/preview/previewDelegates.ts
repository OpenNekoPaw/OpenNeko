import { getGlobalVSCodeApi } from '../utils/vscode';
import type { PreviewDelegateRequest } from './types';

export function dispatchPreviewDelegate(request: PreviewDelegateRequest): void {
  const vscode = getGlobalVSCodeApi();
  if (!vscode) {
    return;
  }

  vscode.postMessage({
    type: 'preview:delegateAction',
    action: request.action,
    asset: request.asset,
  });
}

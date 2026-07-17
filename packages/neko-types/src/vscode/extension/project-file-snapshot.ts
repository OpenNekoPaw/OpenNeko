import type * as vscode from 'vscode';
import {
  createProjectFileSnapshotRequestId,
  isProjectFileSnapshotResponseMessage,
  PROJECT_FILE_SNAPSHOT_REQUEST,
  type ProjectFileSaveReason,
} from '../../project-file-io';

export interface RequestWebviewProjectSnapshotOptions {
  readonly formatId?: string;
  readonly saveReason?: ProjectFileSaveReason;
  readonly timeoutMs?: number;
}

const DEFAULT_PROJECT_SNAPSHOT_TIMEOUT_MS = 5000;

export function requestWebviewProjectSnapshot<TDocument>(
  webview: Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage'>,
  options: RequestWebviewProjectSnapshotOptions = {},
): Promise<TDocument> {
  const requestId = createProjectFileSnapshotRequestId();
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROJECT_SNAPSHOT_TIMEOUT_MS;

  return new Promise<TDocument>((resolve, reject) => {
    let settled = false;
    const cleanupCallbacks: Array<() => void> = [];
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
      callback();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`Timed out waiting for project snapshot (${options.formatId ?? 'nk*'}).`));
      });
    }, timeoutMs);
    cleanupCallbacks.push(() => clearTimeout(timer));

    const disposable = webview.onDidReceiveMessage((message: unknown) => {
      if (!isProjectFileSnapshotResponseMessage<TDocument>(message)) return;
      if (message.requestId !== requestId) return;

      finish(() => {
        if (!message.ok || message.document === undefined) {
          reject(new Error(message.error ?? 'Webview did not provide a project snapshot.'));
          return;
        }
        resolve(message.document);
      });
    });
    cleanupCallbacks.push(() => disposable.dispose());

    void webview
      .postMessage({
        type: PROJECT_FILE_SNAPSHOT_REQUEST,
        requestId,
        ...(options.formatId ? { formatId: options.formatId } : {}),
        ...(options.saveReason ? { saveReason: options.saveReason } : {}),
      })
      .then((posted) => {
        if (posted) return;
        finish(() => reject(new Error('Unable to post project snapshot request to webview.')));
      });
  });
}

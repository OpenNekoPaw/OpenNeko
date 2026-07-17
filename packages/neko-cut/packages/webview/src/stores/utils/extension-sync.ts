/**
 * Extension Sync — send EditOperation to Extension Host
 *
 * Called from operationHistorySlice after state changes
 * (pushOperation, opUndo, opRedo) to keep Extension model in sync.
 */

import { postMessage } from '@neko/shared/vscode';
import type { EditOperation } from '@neko/shared';

let projectChangedSyncSuppressionDepth = 0;

export function suppressProjectChangedSync<T>(action: () => T): T {
  projectChangedSyncSuppressionDepth++;
  try {
    return action();
  } finally {
    projectChangedSyncSuppressionDepth--;
  }
}

export function isProjectChangedSyncSuppressed(): boolean {
  return projectChangedSyncSuppressionDepth > 0;
}

export function syncOperationToExtension(op: EditOperation): void {
  postMessage({ type: 'operationApplied', operation: op });
}

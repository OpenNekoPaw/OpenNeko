export type CutHistoryDirection = 'undo' | 'redo';

export interface CutWorkbenchHistoryRequest {
  readonly direction: CutHistoryDirection;
  readonly panelActive: boolean;
  readonly execute: (command: CutHistoryDirection) => PromiseLike<unknown>;
}

/**
 * Routes explicit Webview history controls through VS Code's custom document
 * edit stack so dirty state, Save, undo, and redo remain one canonical path.
 */
export async function executeCutWorkbenchHistory(
  request: CutWorkbenchHistoryRequest,
): Promise<void> {
  if (!request.panelActive) {
    throw new Error('History actions require the originating active Cut editor.');
  }
  await request.execute(request.direction);
}

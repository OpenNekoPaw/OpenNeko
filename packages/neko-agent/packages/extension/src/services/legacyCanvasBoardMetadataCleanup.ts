import type * as vscode from 'vscode';

const LEGACY_CANVAS_BOARD_METADATA_KEYS = ['neko.agent.canvasBoardBindings.v1'] as const;

export interface LegacyCanvasBoardMetadataCleanupResult {
  readonly removedKeys: readonly string[];
}

export async function cleanupLegacyCanvasBoardMetadata(
  state: Pick<vscode.Memento, 'get' | 'update'>,
): Promise<LegacyCanvasBoardMetadataCleanupResult> {
  const removedKeys: string[] = [];
  for (const key of LEGACY_CANVAS_BOARD_METADATA_KEYS) {
    if (state.get<unknown>(key) === undefined) continue;
    await state.update(key, undefined);
    removedKeys.push(key);
  }
  return { removedKeys };
}

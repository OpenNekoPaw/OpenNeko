import type * as vscode from 'vscode';

const LEGACY_CONVERSATION_WORKSPACE_STATE_KEYS = ['conversations'] as const;

export interface LegacyConversationWorkspaceStateCleanupResult {
  readonly removedKeys: readonly string[];
}

export async function cleanupLegacyConversationWorkspaceState(
  state: Pick<vscode.Memento, 'get' | 'update'>,
): Promise<LegacyConversationWorkspaceStateCleanupResult> {
  const removedKeys: string[] = [];
  for (const key of LEGACY_CONVERSATION_WORKSPACE_STATE_KEYS) {
    if (state.get<unknown>(key) === undefined) continue;
    await state.update(key, undefined);
    removedKeys.push(key);
  }
  return { removedKeys };
}

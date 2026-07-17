import * as vscode from 'vscode';

export const NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT = 'neko.webview.keyboardEditable';
export const NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND =
  'neko.webviewKeyboard.updateEditableOwner';
export const NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND = 'neko.webviewKeyboard.hasEditableOwner';

export interface WebviewKeyboardEditableOwnerUpdate {
  readonly ownerId: string;
  readonly editable: boolean;
}

export function isWebviewKeyboardEditableOwnerUpdate(
  value: unknown,
): value is WebviewKeyboardEditableOwnerUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { ownerId?: unknown; editable?: unknown };
  return typeof candidate.ownerId === 'string' && typeof candidate.editable === 'boolean';
}

export async function updateWebviewKeyboardEditableOwner(
  ownerId: string,
  editable: boolean,
): Promise<void> {
  await vscode.commands.executeCommand(NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND, {
    ownerId,
    editable,
  } satisfies WebviewKeyboardEditableOwnerUpdate);
}

export async function hasWebviewKeyboardEditableOwner(): Promise<boolean> {
  const result = await vscode.commands.executeCommand<unknown>(
    NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
  );
  return result === true;
}

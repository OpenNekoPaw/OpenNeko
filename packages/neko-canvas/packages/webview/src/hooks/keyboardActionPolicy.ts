const EDITOR_LEVEL_KEYBOARD_ACTIONS = new Set([
  'deleteSelected',
  'escape',
  'selectAll',
  'undo',
  'redo',
  'copy',
  'cut',
  'paste',
  'pasteInPlace',
  'duplicate',
  'resetZoom',
  'generateSelected',
]);

export function isEditorLevelKeyboardAction(action: unknown): action is string {
  return typeof action === 'string' && EDITOR_LEVEL_KEYBOARD_ACTIONS.has(action);
}

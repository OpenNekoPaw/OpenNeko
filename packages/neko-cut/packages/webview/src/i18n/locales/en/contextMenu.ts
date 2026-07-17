import type { MessageBundle } from '@neko/shared';

export const contextMenu = {
  'contextMenu.cut': 'Cut',
  'contextMenu.copy': 'Copy',
  'contextMenu.paste': 'Paste',
  'contextMenu.duplicate': 'Duplicate',
  'contextMenu.delete': 'Delete',
  'contextMenu.align': 'Align',
  'contextMenu.alignLeft': 'Align Left',
  'contextMenu.alignCenter': 'Align Center',
  'contextMenu.alignRight': 'Align Right',
  'contextMenu.alignTop': 'Align Top',
  'contextMenu.alignMiddle': 'Align Middle',
  'contextMenu.alignBottom': 'Align Bottom',
  'contextMenu.aiOperations': 'AI Operations',
} as const satisfies MessageBundle;

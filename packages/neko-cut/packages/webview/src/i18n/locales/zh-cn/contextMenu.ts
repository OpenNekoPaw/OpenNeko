import type { MessageBundle } from '@neko/shared';

export const contextMenu = {
  'contextMenu.cut': '剪切',
  'contextMenu.copy': '复制',
  'contextMenu.paste': '粘贴',
  'contextMenu.duplicate': '创建副本',
  'contextMenu.delete': '删除',
  'contextMenu.align': '对齐',
  'contextMenu.alignLeft': '左对齐',
  'contextMenu.alignCenter': '水平居中',
  'contextMenu.alignRight': '右对齐',
  'contextMenu.alignTop': '顶部对齐',
  'contextMenu.alignMiddle': '垂直居中',
  'contextMenu.alignBottom': '底部对齐',
  'contextMenu.aiOperations': 'AI 操作',
} as const satisfies MessageBundle;

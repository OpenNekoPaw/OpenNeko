import type { MessageBundle } from '@neko/shared';

export const header = {
  'header.newChat': '新对话',
  'header.conversations': '对话',
  'header.closeTab': '关闭标签',
  'header.history': '历史记录',
  'header.settings': '设置',
  'header.tasks': '任务',
  'header.noConversations': '暂无对话记录',
  'header.deleteConversation': '删除对话',
  'header.tabStatus.running': '执行中',
  'header.tabStatus.completed': '完成',
} as const satisfies MessageBundle;

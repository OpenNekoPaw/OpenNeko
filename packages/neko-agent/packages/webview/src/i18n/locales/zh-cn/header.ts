import type { MessageBundle } from '@neko/shared';

export const header = {
  'header.newChat': '新对话',
  'header.roleplay': '角色会话',
  'header.roleplayHint': '选择角色并开始角色会话。',
  'header.roleplaySection': '角色',
  'header.roleplayEmpty': '暂无可扮演角色',
  'header.roleplayBadge': '角色',
  'header.roleplayConfirmBadge': '确认',
  'header.conversations': '对话',
  'header.closeTab': '关闭标签',
  'header.history': '历史记录',
  'header.settings': '设置',
  'header.noConversations': '暂无对话记录',
  'header.deleteConversation': '删除对话',
  'header.tabStatus.running': '执行中',
  'header.tabStatus.completed': '完成',
} as const satisfies MessageBundle;

import type { MessageBundle } from '@neko/shared';

export const header = {
  'header.newChat': 'New Chat',
  'header.conversations': 'Conversations',
  'header.closeTab': 'Close tab',
  'header.history': 'History',
  'header.settings': 'Settings',
  'header.tasks': 'Tasks',
  'header.noConversations': 'No conversations yet',
  'header.deleteConversation': 'Delete conversation',
  'header.tabStatus.running': 'Running',
  'header.tabStatus.completed': 'Completed',
} as const satisfies MessageBundle;

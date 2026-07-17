import type { MessageBundle } from '@neko/shared';

export const header = {
  'header.newChat': 'New Chat',
  'header.history': 'History',
  'header.settings': 'Settings',
  'header.tasks': 'Tasks',
  'header.noConversations': 'No conversations yet',
  'header.deleteConversation': 'Delete conversation',
} as const satisfies MessageBundle;

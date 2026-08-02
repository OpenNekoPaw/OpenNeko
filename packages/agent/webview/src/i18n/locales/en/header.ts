import type { MessageBundle } from '@neko/ui/i18n';

export const header = {
  'header.newChat': 'New Chat',
  'header.roleplay': 'Role Session',
  'header.roleplayHint': 'Choose a character to start a role session.',
  'header.roleplaySection': 'Characters',
  'header.roleplayEmpty': 'No playable characters',
  'header.roleplayBadge': 'Character',
  'header.roleplayConfirmBadge': 'Confirm',
  'header.conversations': 'Conversations',
  'header.closeTab': 'Close tab',
  'header.history': 'History',
  'header.settings': 'Settings',
  'header.noConversations': 'No conversations yet',
  'header.deleteConversation': 'Delete conversation',
  'header.tabStatus.running': 'Running',
  'header.tabStatus.completed': 'Completed',
} as const satisfies MessageBundle;

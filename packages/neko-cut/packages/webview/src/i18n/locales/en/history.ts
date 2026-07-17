import type { MessageBundle } from '@neko/shared';

export const history = {
  'history.title': 'History',
  'history.search': 'Search conversations...',
  'history.recentConversations': 'Recent Conversations',
  'history.results': 'Results ({count})',
  'history.noMatching': 'No matching conversations',
  'history.noConversations': 'No conversations yet',
  'history.messageCount': '{count} messages',
  'history.searchHint': 'Type to search all {count} conversations',
  'history.timeAgo.justNow': 'Just now',
  'history.timeAgo.minutes': '{count}m ago',
  'history.timeAgo.hours': '{count}h ago',
  'history.timeAgo.days': '{count}d ago',
} as const satisfies MessageBundle;

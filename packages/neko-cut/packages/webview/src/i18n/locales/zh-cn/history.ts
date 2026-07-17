import type { MessageBundle } from '@neko/shared';

export const history = {
  'history.title': '历史记录',
  'history.search': '搜索对话...',
  'history.recentConversations': '最近的对话',
  'history.results': '搜索结果 ({count})',
  'history.noMatching': '没有匹配的对话',
  'history.noConversations': '暂无对话记录',
  'history.messageCount': '{count} 条消息',
  'history.searchHint': '输入以搜索全部 {count} 个对话',
  'history.timeAgo.justNow': '刚刚',
  'history.timeAgo.minutes': '{count}分钟前',
  'history.timeAgo.hours': '{count}小时前',
  'history.timeAgo.days': '{count}天前',
} as const satisfies MessageBundle;

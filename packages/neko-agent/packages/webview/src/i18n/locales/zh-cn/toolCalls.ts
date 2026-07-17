import type { MessageBundle } from '@neko/shared';

export const toolCalls = {
  'toolCalls.executing': '执行中',
  'toolCalls.completed': '已完成',
  'toolCalls.failed': '失败',
  'toolCalls.awaitingApproval': '等待确认',
  'toolCalls.approve': '允许',
  'toolCalls.deny': '拒绝',
  'toolCalls.tool': '工具',
  'toolCalls.args': '参数',
  'toolCalls.success': '成功',
} as const satisfies MessageBundle;

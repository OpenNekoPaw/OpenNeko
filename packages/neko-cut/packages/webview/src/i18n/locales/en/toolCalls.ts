import type { MessageBundle } from '@neko/shared';

export const toolCalls = {
  'toolCalls.executing': 'Executing',
  'toolCalls.completed': 'Completed',
  'toolCalls.failed': 'Failed',
  'toolCalls.awaitingApproval': 'Awaiting approval',
  'toolCalls.approve': 'Approve',
  'toolCalls.deny': 'Deny',
  'toolCalls.tool': 'Tool',
  'toolCalls.args': 'Args',
  'toolCalls.success': 'Success',
} as const satisfies MessageBundle;

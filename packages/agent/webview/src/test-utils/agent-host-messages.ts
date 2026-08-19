import { vi } from 'vitest';
import {
  createAgentHostMessages,
  type AgentHostMessageSender,
  type AgentHostRuntimeAdapter,
} from '../messages';

export function createTestAgentHostMessageSender(
  overrides: Partial<AgentHostMessageSender> = {},
): AgentHostMessageSender {
  const adapter: AgentHostRuntimeAdapter = {
    hostKind: 'electron',
    runtimeId: 'agent-webview-test-runtime',
    send: vi.fn(),
    submitMessage: vi.fn(async (message) => ({
      submissionId: 'agent-webview-test-submission',
      conversationId: message.conversationId,
      turnId: 'agent-webview-test-turn',
      queueItemId: 'agent-webview-test-queue-item',
      message: message.message,
      createdAt: Date.now(),
      state: 'active' as const,
    })),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: vi.fn(),
    setState: vi.fn(),
  };
  return { ...createAgentHostMessages(adapter), ...overrides };
}

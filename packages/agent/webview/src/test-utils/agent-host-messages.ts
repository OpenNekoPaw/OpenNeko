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
    createConversation: vi.fn(async (message) => ({
      submissionId: 'agent-webview-test-first-submission',
      conversationId: 'agent-webview-test-conversation',
      turnId: 'agent-webview-test-first-turn',
      queueItemId: 'agent-webview-test-first-queue-item',
      message: message.input.kind === 'message' ? message.input.text : (message.input.args ?? ''),
      createdAt: Date.now(),
      state: 'active' as const,
    })),
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

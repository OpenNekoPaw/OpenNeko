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
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: vi.fn(),
    setState: vi.fn(),
  };
  return { ...createAgentHostMessages(adapter), ...overrides };
}

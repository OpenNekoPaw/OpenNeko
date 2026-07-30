import { describe, expect, it, vi } from 'vitest';
import {
  generateExtensionStatusData,
  handleClear,
  handleExit,
  handleHelp,
  handleStatus,
} from '../core-handlers';
import type { CommandContext } from '../../types';

function createMockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    config: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      executionMode: 'auto',
    },
    conversations: {
      getActiveId: vi.fn(() => 'conv-123'),
      list: vi.fn(() => [{ id: 'conv-123' }, { id: 'conv-456' }]),
      getActiveMessageCount: vi.fn(() => 3),
      create: vi.fn(),
      clearCurrent: vi.fn(),
    },
    contextManager: {
      getTokenCount: vi.fn(() => 1500),
    },
    ...overrides,
  } as unknown as CommandContext;
}

describe('generateExtensionStatusData', () => {
  it('returns a semantic status read model', () => {
    const data = generateExtensionStatusData(createMockContext());

    expect(data).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      conversationCount: 2,
      activeConversationId: 'conv-123',
      messageCount: 3,
      tokenCount: 1500,
      activeSkill: undefined,
      executionMode: 'auto',
    });
  });

  it('uses neutral data defaults when optional services are absent', () => {
    const data = generateExtensionStatusData(
      createMockContext({ conversations: undefined, contextManager: undefined }),
    );

    expect(data.conversationCount).toBe(0);
    expect(data.tokenCount).toBe(0);
  });
});

describe('core handlers', () => {
  it('returns action-only help semantics', async () => {
    const result = await handleHelp([], createMockContext());

    expect(result).toEqual({
      handled: true,
      continueExecution: true,
      action: 'showHelp',
    });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });

  it('returns status data without preformatted prose', async () => {
    const result = await handleStatus([], createMockContext());

    expect(result).toMatchObject({
      handled: true,
      continueExecution: true,
      action: 'showStatus',
      data: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });

  it('clears the active conversation and returns typed semantics', async () => {
    const context = createMockContext();
    const result = await handleClear([], context);

    expect(context.conversations?.clearCurrent).toHaveBeenCalled();
    expect(result).toEqual({
      handled: true,
      continueExecution: true,
      action: 'clearHistory',
      semantic: { family: 'core', result: { kind: 'history-cleared' } },
    });
  });

  it('returns typed exit semantics', async () => {
    const result = await handleExit([], createMockContext());

    expect(result).toEqual({
      handled: true,
      continueExecution: false,
      action: 'exit',
      semantic: { family: 'core', result: { kind: 'exit' } },
    });
  });
});

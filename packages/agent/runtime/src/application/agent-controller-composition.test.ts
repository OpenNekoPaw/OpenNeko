import { describe, expect, it, vi } from 'vitest';
import {
  buildAgentConversationTurnFailureMessage,
  waitForDesktopAgentIdle,
} from './agent-controller-composition';

describe('Desktop Agent complete-session idle observation', () => {
  it('projects Turn preparation failure to the exact Conversation instead of global UI', () => {
    expect(
      buildAgentConversationTurnFailureMessage(
        'conversation-epub',
        new Error('ReadDocument source is unavailable.'),
      ),
    ).toEqual({
      type: 'error',
      conversationId: 'conversation-epub',
      message: 'ReadDocument source is unavailable.',
    });
  });

  it('waits for a submitted turn identity before accepting terminal idle', async () => {
    const identity = {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    };
    let poll = 0;

    await expect(
      waitForDesktopAgentIdle({
        conversationId: identity.conversationId,
        timeoutMs: 1000,
        readLatestIdentity: () => (poll === 0 ? undefined : identity),
        readActiveTurn: () => poll === 1,
        now: () => poll * 10,
        waitForPoll: async () => {
          poll += 1;
        },
      }),
    ).resolves.toEqual(identity);
    expect(poll).toBe(2);
  });

  it('distinguishes a missing turn from a turn that never becomes idle', async () => {
    const waitForPoll = vi.fn(async () => undefined);
    await expect(
      waitForDesktopAgentIdle({
        conversationId: 'conversation-missing',
        timeoutMs: 1,
        readLatestIdentity: () => undefined,
        readActiveTurn: () => undefined,
        now: sequence(0, 1),
        waitForPoll,
      }),
    ).rejects.toThrow('has no observed turn identity within 1ms');

    await expect(
      waitForDesktopAgentIdle({
        conversationId: 'conversation-running',
        timeoutMs: 1,
        readLatestIdentity: () => ({
          conversationId: 'conversation-running',
          turnId: 'turn-1',
          runId: 'run-1',
        }),
        readActiveTurn: () => ({ turnId: 'turn-1', runId: 'run-1' }),
        now: sequence(0, 1),
        waitForPoll,
      }),
    ).rejects.toThrow('did not reach terminal idle within 1ms');
  });

  it('requires a new terminal identity after the previous turn fence', async () => {
    const first = {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    };
    const second = { ...first, turnId: 'turn-2', runId: 'run-2' };
    let poll = 0;

    await expect(
      waitForDesktopAgentIdle({
        conversationId: first.conversationId,
        timeoutMs: 1000,
        afterIdentity: first,
        readLatestIdentity: () => (poll === 0 ? first : second),
        readActiveTurn: () => undefined,
        now: () => poll * 10,
        waitForPoll: async () => {
          poll += 1;
        },
      }),
    ).resolves.toEqual(second);
    expect(poll).toBe(1);
  });
});

function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

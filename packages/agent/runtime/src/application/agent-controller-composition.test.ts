import { describe, expect, it, vi } from 'vitest';
import {
  buildAgentConversationTurnFailureMessage,
  waitForDesktopAgentIdle,
} from './agent-controller-composition';
import { createDeferredDesktopAgentFactsEvents } from './deferred-desktop-agent-facts-events';

describe('Desktop Agent complete-session idle observation', () => {
  it('fails visibly when a completed Turn never composed its final system prompt', () => {
    const factsEvents = createDeferredDesktopAgentFactsEvents();
    const identity = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      branchId: 'main',
      turnId: 'turn-1',
      runId: 'run-1',
    };

    expect(() => factsEvents.requireBound(identity)).toThrow(
      "completed turn 'conversation-1/turn-1/run-1' without composing its final system prompt",
    );
  });

  it('fails visibly when the final system prompt belongs to another Turn', () => {
    const factsEvents = createDeferredDesktopAgentFactsEvents();
    const identity = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      branchId: 'main',
      turnId: 'turn-1',
      runId: 'run-1',
    };
    factsEvents.bind(identity, { emit: () => undefined });

    expect(() =>
      factsEvents.requireBound({ ...identity, turnId: 'turn-2', runId: 'run-2' }),
    ).toThrow(
      "final system prompt identity 'conversation-1/turn-1/run-1' does not match completed turn 'conversation-1/turn-2/run-2'",
    );
  });

  it('replays early product events once after final-prompt binding', () => {
    const factsEvents = createDeferredDesktopAgentFactsEvents();
    const identity = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      branchId: 'main',
      turnId: 'turn-1',
      runId: 'run-1',
    };
    const event = {
      identity,
      timestamp: 1,
      type: 'usage' as const,
      provider: 'provider-1',
      model: 'model-1',
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    const emit = vi.fn(() => undefined);

    factsEvents.events.emit(event);
    expect(emit).not.toHaveBeenCalled();
    factsEvents.bind(identity, { emit });
    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(event);
  });

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

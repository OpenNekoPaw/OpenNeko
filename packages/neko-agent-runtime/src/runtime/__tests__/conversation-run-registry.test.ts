import { describe, expect, it, vi } from 'vitest';
import { createConversationRunRegistry } from '../session/conversation-run-registry';

const runA = { conversationId: 'conversation-a', runId: 'run-1' } as const;
const subAgentA = {
  ...runA,
  parentRunId: 'run-1',
  childRunId: 'worker-1',
  childKind: 'subagent',
} as const;
const taskA = {
  ...runA,
  parentRunId: 'worker-1',
  childRunId: 'task-1',
  childKind: 'task',
} as const;

describe('ConversationRunRegistry', () => {
  it('registers an Agent, SubAgent, and Task cancellation tree with immutable scopes', () => {
    const registry = createConversationRunRegistry('conversation-a');
    const cancelRun = vi.fn();
    const cancelSubAgent = vi.fn();
    const cancelTask = vi.fn();

    const run = registry.registerRun(runA, cancelRun);
    const subAgent = registry.registerChild(subAgentA, cancelSubAgent);
    const task = registry.registerChild(taskA, cancelTask);

    expect(registry.hasRun(runA)).toBe(true);
    expect(registry.hasChild(subAgentA)).toBe(true);
    expect(registry.hasChild(taskA)).toBe(true);
    expect(Object.isFrozen(run.scope)).toBe(true);
    expect(Object.isFrozen(subAgent.scope)).toBe(true);
    expect(Object.isFrozen(task.scope)).toBe(true);
  });

  it('cancels descendants before their parent and leaves another run unchanged', () => {
    const registry = createConversationRunRegistry('conversation-a');
    const order: string[] = [];
    const run = registry.registerRun(runA, () => order.push('run-1'));
    const subAgent = registry.registerChild(subAgentA, () => order.push('worker-1'));
    const task = registry.registerChild(taskA, () => order.push('task-1'));
    const runB = { conversationId: 'conversation-a', runId: 'run-2' } as const;
    const cancelB = vi.fn();
    registry.registerRun(runB, cancelB);

    registry.cancelRun(runA, 'user-cancelled');

    expect(order).toEqual(['task-1', 'worker-1', 'run-1']);
    expect(run.signal.aborted).toBe(true);
    expect(subAgent.signal.aborted).toBe(true);
    expect(task.signal.aborted).toBe(true);
    expect(registry.hasRun(runA)).toBe(false);
    expect(registry.hasChild(subAgentA)).toBe(false);
    expect(registry.hasChild(taskA)).toBe(false);
    expect(registry.hasRun(runB)).toBe(true);
    expect(cancelB).not.toHaveBeenCalled();
  });

  it('permits equal local child IDs in independent conversation registries', () => {
    const registryA = createConversationRunRegistry('conversation-a');
    const registryB = createConversationRunRegistry('conversation-b');
    const runB = { conversationId: 'conversation-b', runId: 'run-1' } as const;
    const childB = { ...subAgentA, conversationId: 'conversation-b' } as const;

    registryA.registerRun(runA, vi.fn());
    registryB.registerRun(runB, vi.fn());
    registryA.registerChild(subAgentA, vi.fn());
    registryB.registerChild(childB, vi.fn());

    expect(registryA.hasChild(subAgentA)).toBe(true);
    expect(registryB.hasChild(childB)).toBe(true);
  });

  it('rejects owner mismatch, bare scope, duplicate scope, and orphan children', () => {
    const registry = createConversationRunRegistry('conversation-a');
    registry.registerRun(runA, vi.fn());

    expect(() =>
      registry.registerRun({ conversationId: 'conversation-b', runId: 'run-1' }, vi.fn()),
    ).toThrow(/owner mismatch/);
    expect(() => registry.registerRun({ conversationId: '', runId: '' }, vi.fn())).toThrow(
      /requires non-empty/,
    );
    expect(() => registry.registerRun(runA, vi.fn())).toThrow(/already registered/);
    expect(() => registry.registerChild({ ...subAgentA, runId: 'missing-run' }, vi.fn())).toThrow(
      /Parent Agent run/,
    );
  });

  it('does not complete a parent while owned children remain active', () => {
    const registry = createConversationRunRegistry('conversation-a');
    registry.registerRun(runA, vi.fn());
    registry.registerChild(subAgentA, vi.fn());

    expect(() => registry.completeRun(runA)).toThrow(/still has active children/);

    registry.completeChild(subAgentA);
    registry.completeRun(runA);
    expect(registry.hasRun(runA)).toBe(false);
  });

  it('continues cancelling sibling runs when one callback fails during disposal', () => {
    const registry = createConversationRunRegistry('conversation-a');
    const cancelB = vi.fn();
    registry.registerRun(runA, () => {
      throw new Error('run-a cancel failed');
    });
    registry.registerRun({ conversationId: 'conversation-a', runId: 'run-2' }, cancelB);

    expect(() => registry.dispose()).toThrow('run-a cancel failed');

    expect(cancelB).toHaveBeenCalledOnce();
    expect(registry.disposed).toBe(true);
    expect(() => registry.registerRun(runA, vi.fn())).toThrow(/is disposed/);
  });
});

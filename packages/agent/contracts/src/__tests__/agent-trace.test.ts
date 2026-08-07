import { describe, expect, it } from 'vitest';
import {
  createAgentRunId,
  createAgentTraceContext,
  createAgentTurnId,
  deriveAgentTraceContext,
  withAgentTrace,
} from '../agent-trace';

describe('agent trace contracts', () => {
  it('creates a JSON-serializable trace without changing logger entry shape', () => {
    const trace = createAgentTraceContext({
      conversationId: ' conv-1 ',
      runId: 'run-1',
      turnId: 'turn-1',
      iteration: 1.7,
      phase: 'think',
    });

    expect(trace).toEqual({
      conversationId: 'conv-1',
      runId: 'run-1',
      turnId: 'turn-1',
      iteration: 1,
      phase: 'think',
    });
    expect(JSON.parse(JSON.stringify(trace))).toEqual(trace);
  });

  it('requires an explicit non-empty conversation owner', () => {
    expect(() => createAgentTraceContext({ conversationId: '   ' })).toThrow(
      'Agent trace requires a non-empty conversationId.',
    );
    expect(deriveAgentTraceContext(undefined)).toBeUndefined();
  });

  it('derives phase and request traces without mutating the parent', () => {
    const parent = createAgentTraceContext({
      conversationId: 'conv-1',
      runId: 'run-1',
      turnId: createAgentTurnId('conv-1', 42),
      iteration: 2,
      phase: 'act',
    });
    const child = deriveAgentTraceContext(parent, {
      phase: 'tool',
      parentRequestId: 'llm-1',
      toolRequestId: 'tool-1',
    });

    expect(parent).toEqual({
      conversationId: 'conv-1',
      runId: 'run-1',
      turnId: 'turn-conv-1-16',
      iteration: 2,
      phase: 'act',
    });
    expect(child).toEqual({
      conversationId: 'conv-1',
      runId: 'run-1',
      turnId: 'turn-conv-1-16',
      iteration: 2,
      phase: 'tool',
      parentRequestId: 'llm-1',
      toolRequestId: 'tool-1',
    });
  });

  it('creates distinct prefixes for turn and durable run identities', () => {
    expect(createAgentTurnId(' conv-1 ', 42)).toBe('turn-conv-1-16');
    expect(createAgentRunId(' conv-1 ', 42)).toBe('run-conv-1-16');
  });

  it('places trace under data.trace and prevents payload trace override', () => {
    const trace = createAgentTraceContext({ conversationId: 'conv-1' });

    expect(withAgentTrace(trace, { trace: 'bad', messageCount: 3 })).toEqual({
      trace,
      messageCount: 3,
    });
    expect(withAgentTrace(undefined, { trace: 'bad', messageCount: 3 })).toEqual({
      messageCount: 3,
    });
  });
});

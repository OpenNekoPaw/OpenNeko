import { describe, expect, it } from 'vitest';
import {
  createAgentRunId,
  createAgentTraceContext,
  createAgentTurnId,
  deriveAgentTraceContext,
  UNKNOWN_AGENT_TRACE_ID,
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

  it('uses a safe fallback conversation id for legacy callers', () => {
    expect(createAgentTraceContext().conversationId).toBe(UNKNOWN_AGENT_TRACE_ID);
    expect(createAgentTraceContext({ conversationId: '   ' }).conversationId).toBe(
      UNKNOWN_AGENT_TRACE_ID,
    );
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
  });
});

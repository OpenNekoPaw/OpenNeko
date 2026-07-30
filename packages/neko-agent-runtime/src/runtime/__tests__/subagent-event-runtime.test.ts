import { describe, expect, it } from 'vitest';
import { createSubAgentEventRuntime } from '../subagent-event-runtime';

describe('subagent-event-runtime', () => {
  it('projects events for the target conversation', () => {
    const runtime = createSubAgentEventRuntime();

    const message = runtime.projectForConversation({
      conversationId: 'conv-1',
      event: {
        type: 'progress',
        scope: {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'agent-1',
          childRunId: 'sub-1',
          childKind: 'subagent',
        },
        subAgentId: 'sub-1',
        parentAgentId: 'agent-1',
        conversationId: 'conv-1',
        data: {
          status: 'running',
          progress: 'reading files',
        },
        timestamp: 100,
      },
    });

    expect(message).toEqual({
      type: 'subagentEvent',
      conversationId: 'conv-1',
      event: expect.objectContaining({
        subAgentId: 'sub-1',
        conversationId: 'conv-1',
      }),
      workItem: expect.objectContaining({
        id: 'sub-1',
        conversationId: 'conv-1',
        kind: 'subagent',
        status: 'processing',
      }),
    });
  });

  it('drops events from other conversations', () => {
    const runtime = createSubAgentEventRuntime();

    const message = runtime.projectForConversation({
      conversationId: 'conv-1',
      event: {
        type: 'started',
        scope: {
          conversationId: 'conv-2',
          runId: 'run-2',
          parentRunId: 'agent-2',
          childRunId: 'sub-2',
          childKind: 'subagent',
        },
        subAgentId: 'sub-2',
        parentAgentId: 'agent-2',
        conversationId: 'conv-2',
        timestamp: 200,
      },
    });

    expect(message).toBeNull();
  });
  it('fails visibly when denormalized event ownership disagrees with scope', () => {
    const runtime = createSubAgentEventRuntime();

    expect(() =>
      runtime.projectForConversation({
        conversationId: 'conv-1',
        event: {
          type: 'started',
          scope: {
            conversationId: 'conv-1',
            runId: 'run-1',
            parentRunId: 'agent-1',
            childRunId: 'sub-1',
            childKind: 'subagent',
          },
          subAgentId: 'sub-other',
          parentAgentId: 'agent-1',
          conversationId: 'conv-1',
          timestamp: 1,
        },
      }),
    ).toThrow('SubAgent event owner mismatch');
  });
});

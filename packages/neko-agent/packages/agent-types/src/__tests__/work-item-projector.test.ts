import { describe, expect, it } from 'vitest';
import type { ChildRunScope } from '@neko/shared';
import { getAgentWorkItemRuntimeKey, projectSubAgentEventToWorkItem } from '../work-item-projector';

describe('subagent work item projector', () => {
  it('projects child-run ownership and terminal evidence without generic Task state', () => {
    const scope = subAgentScope('conv-1', 'parent-1', 'sub-1');
    const item = projectSubAgentEventToWorkItem({
      type: 'completed',
      scope,
      subAgentId: 'sub-1',
      parentAgentId: 'parent-1',
      conversationId: 'conv-1',
      data: {
        result: {
          id: 'sub-1',
          status: 'completed',
          response: 'review complete',
        },
        parentMessageId: 'message-1',
        parentToolCallId: 'tool-1',
      },
      timestamp: 1_000,
    });

    expect(item).toMatchObject({
      kind: 'subagent',
      scope,
      status: 'completed',
      progress: 100,
      parentMessageId: 'message-1',
      parentToolCallId: 'tool-1',
      subAgent: {
        parentAgentId: 'parent-1',
        response: 'review complete',
      },
    });
    expect(getAgentWorkItemRuntimeKey(item)).toContain('sub-1');
    expect(item).not.toHaveProperty('task');
  });
});

function subAgentScope(
  conversationId: string,
  parentRunId: string,
  childRunId: string,
): ChildRunScope {
  return {
    conversationId,
    runId: parentRunId,
    parentRunId,
    childRunId,
    childKind: 'subagent',
  };
}

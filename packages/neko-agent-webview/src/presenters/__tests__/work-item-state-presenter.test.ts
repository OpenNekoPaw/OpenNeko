import { describe, expect, it } from 'vitest';
import type { ChildRunScope } from '@neko-agent/contracts';
import { projectSubAgentEventToWorkItem } from '@neko-agent/contracts';
import {
  getWorkItemsForConversation,
  removeConversationWorkItems,
  upsertWorkItemsForConversation,
} from '../work-item-state-presenter';

describe('subagent work item state presenter', () => {
  it('merges progress by full child-run identity and finalizes running steps', () => {
    const scope = subAgentScope('conv-1', 'parent-1', 'sub-1');
    const started = projectSubAgentEventToWorkItem({
      type: 'started',
      scope,
      subAgentId: 'sub-1',
      parentAgentId: 'parent-1',
      conversationId: 'conv-1',
      data: { parentMessageId: 'message-1', parentToolCallId: 'tool-1' },
      timestamp: 1_000,
    });
    const completed = projectSubAgentEventToWorkItem({
      type: 'completed',
      scope,
      subAgentId: 'sub-1',
      parentAgentId: 'parent-1',
      conversationId: 'conv-1',
      data: {
        result: { id: 'sub-1', status: 'completed', response: 'done' },
      },
      timestamp: 2_000,
    });

    let store = upsertWorkItemsForConversation(new Map(), 'conv-1', [started]);
    store = upsertWorkItemsForConversation(store, 'conv-1', [completed]);

    expect(getWorkItemsForConversation(store, 'conv-1')).toEqual([
      expect.objectContaining({
        status: 'completed',
        parentMessageId: 'message-1',
        parentToolCallId: 'tool-1',
        steps: [
          expect.objectContaining({ id: 'subagent-started', status: 'completed' }),
          expect.objectContaining({ id: 'subagent-completed', status: 'completed' }),
        ],
      }),
    ]);
    expect(getWorkItemsForConversation(store, 'conv-2')).toEqual([]);
    expect(removeConversationWorkItems(store, 'conv-1').size).toBe(0);
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

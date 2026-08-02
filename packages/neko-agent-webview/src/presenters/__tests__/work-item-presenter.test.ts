import { describe, expect, it } from 'vitest';
import type { ChildRunScope } from '@neko-agent/contracts';
import type { Message, SubAgentWorkItem } from '@neko-agent/contracts';
import {
  projectAgentWorkItemSteps,
  projectSubAgentCard,
  selectConversationAttentionWorkItems,
} from '../work-item-presenter';

describe('subagent activity presenter', () => {
  it('projects child-run status, progress, steps, and response', () => {
    const item = subAgentItem();
    const card = projectSubAgentCard(item);
    const steps = projectAgentWorkItemSteps(item.steps ?? [], item.currentStepId);

    expect(card).toMatchObject({
      status: { isActive: true, isCompleted: false, isFailed: false },
      tone: 'info',
      typeLabel: 'reviewer',
      progressLabel: '40%',
      showProgressBar: true,
      showResponse: true,
      parentAgentId: 'parent-1',
    });
    expect(steps).toMatchObject({
      currentStepIndex: 0,
      completedSteps: 0,
      currentStepName: 'Review',
    });
  });

  it('keeps only unanchored work items that still require attention', () => {
    const messages: Message[] = [
      {
        id: 'message-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        workItemIds: ['sub-linked'],
      },
    ];
    const items = [
      subAgentItem({ id: 'sub-linked', status: 'processing' }),
      subAgentItem({ id: 'sub-queued', status: 'queued' }),
      subAgentItem({ id: 'sub-processing', status: 'processing' }),
      subAgentItem({ id: 'sub-failed', status: 'failed' }),
      subAgentItem({ id: 'sub-completed', status: 'completed' }),
      subAgentItem({ id: 'sub-cancelled', status: 'cancelled' }),
    ];

    expect(selectConversationAttentionWorkItems(messages, items).map((item) => item.id)).toEqual([
      'sub-queued',
      'sub-processing',
      'sub-failed',
    ]);
  });
});

function subAgentItem(
  overrides: Partial<Pick<SubAgentWorkItem, 'id' | 'status'>> = {},
): SubAgentWorkItem {
  const id = overrides.id ?? 'sub-1';
  return {
    scope: subAgentScope('conv-1', 'parent-1', id),
    id,
    conversationId: 'conv-1',
    kind: 'subagent',
    parentMessageId: 'message-1',
    parentToolCallId: 'tool-1',
    title: 'Review',
    status: overrides.status ?? 'processing',
    progress: 40,
    steps: [{ id: 'review', name: 'Review', status: 'running' }],
    currentStepId: 'review',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:01.000Z',
    subAgent: {
      parentAgentId: 'parent-1',
      type: 'reviewer',
      runMode: 'background',
      response: 'partial',
    },
  };
}

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

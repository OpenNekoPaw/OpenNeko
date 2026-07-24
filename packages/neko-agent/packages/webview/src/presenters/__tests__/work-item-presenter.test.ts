import { describe, expect, it } from 'vitest';
import type { ChildRunScope } from '@neko/shared';
import type { SubAgentWorkItem } from '@neko-agent/types';
import { projectAgentWorkItemSteps, projectSubAgentCard } from '../work-item-presenter';

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
});

function subAgentItem(): SubAgentWorkItem {
  return {
    scope: subAgentScope('conv-1', 'parent-1', 'sub-1'),
    id: 'sub-1',
    conversationId: 'conv-1',
    kind: 'subagent',
    parentMessageId: 'message-1',
    parentToolCallId: 'tool-1',
    title: 'Review',
    status: 'processing',
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

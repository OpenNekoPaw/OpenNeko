import { describe, expect, it } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type Task,
  type TaskRunScope,
} from '@neko/shared';

import { projectTuiTaskResultContinuation } from './tui-task-result-continuation';

describe('projectTuiTaskResultContinuation', () => {
  it('projects an owned completed image task into one stable auto-resume continuation', () => {
    const event = terminalImageTask();

    const continuation = projectTuiTaskResultContinuation({
      event,
      conversationId: event.scope.conversationId,
    });

    expect(continuation).toMatchObject({
      source: 'task-result-continuation',
      displayKind: 'task-continuation',
      metadata: {
        taskId: event.task.id,
        runId: event.scope.runId,
        status: 'queued',
        policy: 'auto-resume-agent',
      },
    });
    expect(continuation?.prompt).toContain('Generated image inputs for ReadImage:');
    expect(continuation?.prompt).toContain('resource-image-1');
  });

  it('does not deliver a task owned by another conversation', () => {
    expect(
      projectTuiTaskResultContinuation({
        event: terminalImageTask(),
        conversationId: 'conversation-other',
      }),
    ).toBeUndefined();
  });
});

function terminalImageTask(): { readonly task: Task; readonly scope: TaskRunScope } {
  const scope: TaskRunScope = {
    conversationId: 'conversation-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId: 'task-1',
    childKind: 'task',
  };
  const task: Task = {
    id: 'task-1',
    type: 'image_generation',
    status: 'completed',
    progress: 100,
    input: { prompt: 'cat' },
    output: {
      data: {
        assets: [
          {
            mimeType: 'image/png',
            localPath: '/tmp/generated.png',
            resourceRef: createResourceRef({
              scope: 'project',
              provider: 'generated-asset',
              kind: 'generated',
              source: {
                kind: 'generated-asset',
                generatedAssetId: 'resource-image-1',
                filePath: '/tmp/generated.png',
              },
              locator: { kind: 'generated-asset', assetId: 'resource-image-1' },
              fingerprint: createResourceFingerprint({
                strategy: 'provider',
                value: 'resource-image-1',
                providerId: 'generated-asset',
              }),
            }),
          },
        ],
      },
    },
    scope,
    lifecycle: {
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'resume-polling',
      ownerConversationId: scope.conversationId,
      ownerRunId: scope.runId,
      resultDeliveryPolicy: { kind: 'auto-resume-agent' },
    },
    createdAt: 1,
    updatedAt: 2,
  };
  return { task, scope };
}

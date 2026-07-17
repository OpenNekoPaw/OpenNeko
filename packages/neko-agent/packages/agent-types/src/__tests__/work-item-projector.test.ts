import { describe, expect, it } from 'vitest';
import { projectMediaTaskToBackgroundTask } from '../work-item-projector';

describe('work item projector', () => {
  it('preserves a non-retryable media failure policy', () => {
    const task = projectMediaTaskToBackgroundTask({
      scope: {
        conversationId: 'conversation-1',
        runId: 'run-1',
        parentRunId: 'run-1',
        childRunId: 'task-1',
        childKind: 'task',
      },
      id: 'task-1',
      type: 'image',
      status: 'failed',
      progress: 100,
      providerId: 'newapi',
      modelId: 'gpt-image-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
      error: {
        code: 'NEWAPI_IMAGE_OUTCOME_UNKNOWN',
        message: 'Provider outcome is unknown.',
        retryable: false,
      },
      request: { prompt: 'cat' },
    });

    expect(task).toMatchObject({
      status: 'failed',
      error: 'Provider outcome is unknown.',
      retryable: false,
    });
  });
});

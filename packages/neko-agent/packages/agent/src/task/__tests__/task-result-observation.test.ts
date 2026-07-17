import { describe, expect, it } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type ResourceRef,
  type Task,
  type TaskRunScope,
} from '@neko/shared';
import {
  AgentTaskResultObservationError,
  createAgentTaskResultObservationRecords,
  evaluateAgentTaskResultDelivery,
  normalizeAgentTaskResultObservation,
} from '../task-result-observation';

describe('task result observation', () => {
  it('normalizes a completed owned task into an Agent observation contract', () => {
    const task = createTask({
      status: 'completed',
      output: {
        data: {
          resultUrls: ['https://cdn.example.test/image.png'],
          assetIds: ['asset-1'],
        },
      },
    });

    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'task-manager',
      parentToolCallId: 'tool-1',
      now: 30,
    });
    const records = createAgentTaskResultObservationRecords({
      observation,
      outputData: task.output?.data,
      now: 31,
    });

    expect(observation).toMatchObject({
      conversationId: 'conv-1',
      runId: 'run-1',
      taskId: 'task-1',
      status: 'completed',
      parentToolCallId: 'tool-1',
    });
    expect(observation.resultRefs).toEqual([
      { kind: 'url', id: 'https://cdn.example.test/image.png' },
      { kind: 'asset', id: 'asset-1' },
    ]);
    expect(records.observation.evidenceIds).toEqual([records.evidence.id]);
    expect(records.evidence.data).toMatchObject({
      taskResultObservation: observation,
    });
  });

  it('preserves generated ResourceRef handles for ReadImage follow-up turns', () => {
    const resourceRef = createGeneratedResourceRef();
    const task = createTask({
      output: {
        data: {
          assets: [
            {
              id: 'asset-1',
              mimeType: 'image/png',
              label: 'generated-assets/asset-1.png',
              resourceRef,
              localPath: '/workspace/neko/generated/image/asset-1.png',
            },
          ],
        },
      },
    });

    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'media-task',
    });
    const decision = evaluateAgentTaskResultDelivery({
      observation,
      policy: { kind: 'auto-resume-agent' },
      now: 40,
    });

    expect(observation.resultRefs).toEqual([
      {
        kind: 'resource',
        id: resourceRef.id,
        mimeType: 'image/png',
        label: 'generated-assets/asset-1.png',
        resourceRef,
      },
    ]);
    expect(decision).toMatchObject({
      kind: 'auto-resume-agent',
      followUpRequest: {
        prompt: expect.stringContaining('Generated image inputs for ReadImage:'),
      },
    });
    if (decision.kind !== 'auto-resume-agent') {
      throw new Error('Expected auto-resume decision');
    }
    expect(decision.followUpRequest.prompt).toContain('"resourceRef"');
    expect(decision.followUpRequest.prompt).toContain(resourceRef.id);
    expect(decision.followUpRequest.prompt).toContain('Do not use the task id');
    expect(decision.followUpRequest.prompt).not.toContain('- asset: asset-1');
  });

  it('keeps explicitly declared AssetLibrary result identities', () => {
    const task = createTask({
      output: {
        data: {
          resultRefs: [{ kind: 'asset', id: 'asset-explicit', label: 'Hero' }],
          assetId: 'asset-single',
          assetIds: ['asset-list'],
        },
      },
    });

    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'task-manager',
    });

    expect(observation.resultRefs).toEqual([
      { kind: 'asset', id: 'asset-explicit', label: 'Hero' },
      { kind: 'asset', id: 'asset-single' },
      { kind: 'asset', id: 'asset-list' },
    ]);
  });

  it('uses the task scope as authority when lifecycle owner metadata is absent', () => {
    const observation = normalizeAgentTaskResultObservation({
      task: createTask({ lifecycle: undefined }),
      source: 'task-manager',
    });

    expect(observation).toMatchObject({
      conversationId: 'conv-1',
      runId: 'run-1',
      taskId: 'task-1',
    });
  });

  it('does not let conflicting lifecycle metadata rebind the task owner', () => {
    const task = createTask({
      lifecycle: {
        ownerConversationId: 'conv-other',
        ownerRunId: 'run-other',
        ownerRunStartedAt: 101,
        runMode: 'background',
        costPhase: 'idle',
        interruptPolicy: 'detach-and-continue',
        recoverPolicy: 'snapshot-only',
      },
    });

    expect(normalizeAgentTaskResultObservation({ task, source: 'task-manager' })).toMatchObject({
      conversationId: 'conv-1',
      runId: 'run-1',
      runStartedAt: 101,
    });
  });

  it('rejects invalid task owner scopes visibly', () => {
    const task = createTask({
      scope: { ...taskScope('task-1'), runId: '' },
    });

    expect(() =>
      normalizeAgentTaskResultObservation({ task, source: 'task-manager' }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentTaskResultObservationError>>({
        code: 'invalid-owner-scope',
      }),
    );
  });

  it('rejects terminal event scopes that do not match the task owner scope', () => {
    const task = createTask();

    expect(() =>
      normalizeAgentTaskResultObservation({
        task,
        source: 'task-manager',
        scope: { ...task.scope, runId: 'run-other' },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentTaskResultObservationError>>({
        code: 'owner-scope-mismatch',
      }),
    );
  });

  it('rejects local paths as durable result refs', () => {
    const task = createTask({
      output: {
        data: {
          resultUrls: ['/Users/feng/cache/image.png'],
        },
      },
    });

    expect(() =>
      normalizeAgentTaskResultObservation({
        task,
        source: 'task-manager',
      }),
    ).toThrowError(/http\(s\)|local/);
  });

  it('normalizes failed and cancelled terminal tasks without claiming successful results', () => {
    const failed = normalizeAgentTaskResultObservation({
      task: createTask({
        status: 'failed',
        error: 'provider failed',
        output: { error: 'provider failed' },
      }),
      source: 'media-task',
    });
    const cancelled = normalizeAgentTaskResultObservation({
      task: createTask({ status: 'cancelled' }),
      source: 'tool-background-task',
    });

    expect(failed).toMatchObject({
      status: 'failed',
      error: 'provider failed',
      summary: expect.stringContaining('failed'),
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      summary: expect.stringContaining('cancelled'),
    });
  });

  it('creates an explicit auto-resume follow-up only from policy', () => {
    const task = createTask();
    const observation = normalizeAgentTaskResultObservation({
      task,
      source: 'task-manager',
    });

    expect(evaluateAgentTaskResultDelivery({ observation })).toEqual({
      kind: 'append-observation',
    });

    const decision = evaluateAgentTaskResultDelivery({
      observation,
      policy: { kind: 'auto-resume-agent', prompt: 'Continue now' },
      now: 40,
    });

    expect(decision).toMatchObject({
      kind: 'auto-resume-agent',
      followUpRequest: {
        conversationId: 'conv-1',
        observationId: observation.id,
        taskId: 'task-1',
        prompt: 'Continue now',
      },
    });
  });

  it('rejects unknown delivery policies visibly', () => {
    const observation = normalizeAgentTaskResultObservation({
      task: createTask(),
      source: 'task-manager',
    });

    expect(() =>
      evaluateAgentTaskResultDelivery({
        observation,
        policy: { kind: 'resume-anyway' } as never,
      }),
    ).toThrowError(AgentTaskResultObservationError);
  });
});

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? 'task-1';
  return {
    scope: overrides.scope ?? taskScope(id),
    id,
    type: 'image_generation',
    status: 'completed',
    input: {
      type: 'image_generation',
      payload: {},
    },
    progress: 100,
    createdAt: 10,
    updatedAt: 20,
    lifecycle: {
      ownerConversationId: 'conv-1',
      ownerRunId: 'run-1',
      ownerRunStartedAt: 101,
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
    },
    ...overrides,
  };
}

function createGeneratedResourceRef(): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'generated-asset',
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: 'asset-1',
      filePath: '/workspace/neko/generated/image/asset-1.png',
      metadata: {
        path: '/workspace/neko/generated/image/asset-1.png',
        mimeType: 'image/png',
      },
    },
    locator: {
      kind: 'generated-asset',
      assetId: 'asset-1',
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      value: 'asset-1',
      providerId: 'generated-asset',
    }),
  });
}

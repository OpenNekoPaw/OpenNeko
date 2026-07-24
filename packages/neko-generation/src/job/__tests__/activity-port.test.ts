import { describe, expect, it, vi } from 'vitest';
import { createDomainActivityProjector } from '@neko/shared/domain-activity';
import { createGenerationJobActivityPort } from '../activity-port';
import type {
  GenerationJobPort,
  GenerationJobSnapshot,
  SubmitGenerationJobInput,
} from '../contracts';

describe('GenerationJobActivityPort', () => {
  it('publishes detached Jobs and keeps linked Jobs only in the caller projection', async () => {
    const projector = createDomainActivityProjector();
    const jobs = createJobs();
    const activityJobs = createGenerationJobActivityPort({
      jobs,
      publisher: projector,
      reportError: vi.fn(),
    });

    await activityJobs.submitGeneration(input('linked'));
    expect(projector.getSnapshot().items).toEqual([]);
    activityJobs.installActivity(snapshot('linked'));
    expect(projector.getSnapshot().items).toEqual([]);

    await activityJobs.submitGeneration(input('detached'));
    expect(projector.getSnapshot().items).toEqual([
      expect.objectContaining({
        jobKind: 'generation',
        jobId: 'generation-detached',
        jobRevision: 1,
      }),
    ]);

    await activityJobs.disposeActivity();
    projector.dispose();
  });
});

function createJobs(): GenerationJobPort {
  return {
    submitGeneration: vi.fn(async (request) => snapshot(request.lifecycleMode)),
    describeGeneration: vi.fn(),
    observeGeneration: () => emptyObservation(),
    cancelGeneration: vi.fn(),
    retryGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
  };
}

async function* emptyObservation(): AsyncIterable<GenerationJobSnapshot> {}

function input(lifecycleMode: GenerationJobSnapshot['lifecycleMode']): SubmitGenerationJobInput {
  return {
    lifecycleMode,
    generationType: 'text-to-image',
    providerId: 'provider-1',
    modelId: 'image-model',
    request: { prompt: 'cat' },
  };
}

function snapshot(lifecycleMode: GenerationJobSnapshot['lifecycleMode']): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: `generation-${lifecycleMode}` },
    lifecycleMode,
    phase: 'pending',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'image-model',
      request: { prompt: 'cat' },
    },
    progress: { stage: 'queued', percent: 0 },
  };
}

import { describe, expect, it, vi } from 'vitest';
import type { GenerationJobPort, GenerationJobSnapshot } from '@neko/generation';
import { OpenNekoDomainActivityHost } from './domain-activity-host';

describe('OpenNekoDomainActivityHost', () => {
  it('routes explicit Generation identity and revision without latest fallback', async () => {
    const jobs = generationJobs();
    const host = new OpenNekoDomainActivityHost(() => jobs);

    await host.execute({
      jobKind: 'generation',
      jobId: 'generation-exact',
      expectedRevision: 7,
      command: 'cancel',
    });

    expect(jobs.cancelGeneration).toHaveBeenCalledWith({
      ref: { kind: 'generation', jobId: 'generation-exact' },
      expectedRevision: 7,
    });
    expect(jobs.retryGeneration).not.toHaveBeenCalled();
  });

  it('requires the explicit Export command slot and preserves stale failures', async () => {
    const host = new OpenNekoDomainActivityHost(() => generationJobs());
    const command = {
      jobKind: 'export' as const,
      jobId: 'export-exact',
      expectedRevision: 4,
      command: 'cancel' as const,
    };

    await expect(host.execute(command)).rejects.toThrow('Cut Export Job commands are unavailable');

    const execute = vi.fn().mockRejectedValue(new Error('stale-revision'));
    const registration = host.installExportCommandExecutor({ execute });
    await expect(host.execute(command)).rejects.toThrow('stale-revision');
    expect(execute).toHaveBeenCalledWith(command);
    registration.dispose();
  });
});

function generationJobs(): GenerationJobPort {
  const snapshot: GenerationJobSnapshot = {
    ref: { kind: 'generation', jobId: 'generation-exact' },
    lifecycleMode: 'detached',
    phase: 'cancelled',
    revision: 8,
    createdAt: 1,
    updatedAt: 2,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider',
      modelId: 'model',
      request: {
        prompt: 'private',
        providerId: 'provider',
        modelId: 'model',
      },
    },
    progress: { stage: 'waiting-provider', percent: 20 },
    failure: { code: 'cancelled', message: 'Cancelled' },
  };
  return {
    submitGeneration: vi.fn(),
    describeGeneration: vi.fn(),
    observeGeneration: vi.fn(),
    cancelGeneration: vi.fn().mockResolvedValue(snapshot),
    retryGeneration: vi.fn(),
    reconcileGeneration: vi.fn(),
  };
}

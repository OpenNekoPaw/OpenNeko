import { describe, expect, it } from 'vitest';
import { projectGenerationJobActivity } from '../activity';
import type { GenerationJobSnapshot } from '../contracts';

describe('Generation Job Activity projection', () => {
  it('projects only concrete read-only summary fields', () => {
    const activity = projectGenerationJobActivity(snapshot());

    expect(activity).toEqual({
      jobKind: 'generation',
      jobId: 'generation-1',
      phase: 'running',
      jobRevision: 2,
      createdAt: 100,
      updatedAt: 110,
      label: 'image generation',
      mediaKind: 'image',
      progress: { stage: 'waiting-provider', percent: 45 },
      supportedCommands: ['cancel', 'reconcile'],
    });
    expect(JSON.stringify(activity)).not.toContain('secret-provider');
    expect(JSON.stringify(activity)).not.toContain('private prompt');
    expect(JSON.stringify(activity)).not.toContain('provider-task-1');
  });

  it('rejects linked Jobs that belong only to their caller projection', () => {
    expect(() => projectGenerationJobActivity({ ...snapshot(), lifecycleMode: 'linked' })).toThrow(
      'belongs only to its caller projection',
    );
  });
});

function snapshot(): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'generation-1' },
    lifecycleMode: 'detached',
    phase: 'running',
    revision: 2,
    createdAt: 100,
    updatedAt: 110,
    request: {
      generationType: 'text-to-image',
      providerId: 'secret-provider',
      modelId: 'private-model',
      request: {
        prompt: 'private prompt',
        providerId: 'secret-provider',
        modelId: 'private-model',
      },
    },
    progress: { stage: 'waiting-provider', percent: 45 },
    providerTask: {
      providerId: 'secret-provider',
      externalTaskId: 'provider-task-1',
    },
  };
}

import { describe, expect, it } from 'vitest';

import {
  GENERATION_DSH_TOOL_NAME,
  decodeGenerationDshToolInput,
  projectGenerationJobSnapshot,
} from './dsh-tool';
import type { GenerationJobSnapshot } from './job/contracts';

describe('Generation DSH tool contract', () => {
  it('exposes exactly submit and describe with the exact tool name', () => {
    expect(GENERATION_DSH_TOOL_NAME).toBe('openneko.generation');
    expect(
      decodeGenerationDshToolInput('submit', {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: { prompt: 'A quiet harbor' },
      }),
    ).toEqual({
      operation: 'submit',
      input: {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: { prompt: 'A quiet harbor' },
      },
    });
    expect(decodeGenerationDshToolInput('describe', { jobId: 'job-1' })).toEqual({
      operation: 'describe',
      input: { jobId: 'job-1' },
    });
    expect(() => decodeGenerationDshToolInput('cancel', { jobId: 'job-1' })).toThrow(
      /must be one of submit, describe/,
    );
  });

  it('rejects semantic negatives before any Job is created', () => {
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        purpose: '',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: {},
      }),
    ).toThrow(/canonical purpose request contract/);
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        purpose: 'image.generate',
        generationType: 'workflow',
        lifecycleMode: 'detached',
        request: {},
      }),
    ).toThrow(/generation type contract/);
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'active',
        request: {},
      }),
    ).toThrow(/canonical purpose request contract/);
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: { prompt: 'hello', providerId: 'model-chosen-provider' },
      }),
    ).toThrow(/Host-owned/);
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        purpose: 'image.generate',
        generationType: 'text-to-image',
        lifecycleMode: 'detached',
        request: { prompt: 'hello', unknownField: true },
      }),
    ).toThrow(/generation type contract/);
  });

  it('projects bounded durable Job facts without provider result payloads', () => {
    const snapshot: GenerationJobSnapshot = {
      ref: { kind: 'generation', jobId: 'job-1' },
      phase: 'pending',
      createdAt: 1,
      updatedAt: 2,
      lifecycleMode: 'detached',
      request: {
        providerId: 'provider',
        modelId: 'model',
        generationType: 'text-to-image',
        request: { prompt: 'secret prompt', width: 1024 },
      },
      progress: { stage: 'queued', percent: 0 },
    };

    expect(projectGenerationJobSnapshot(snapshot)).toEqual({
      jobId: 'job-1',
      kind: 'generation',
      phase: 'pending',
      stage: 'queued',
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      createdAt: 1,
      updatedAt: 2,
    });
    expect(projectGenerationJobSnapshot(snapshot)).not.toHaveProperty('request');
    expect(projectGenerationJobSnapshot(snapshot)).not.toHaveProperty('resultLocators');
    expect(projectGenerationJobSnapshot(snapshot)).not.toHaveProperty('providerTask');
  });
});

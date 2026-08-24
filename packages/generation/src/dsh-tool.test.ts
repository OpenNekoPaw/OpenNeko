import { describe, expect, it } from 'vitest';

import {
  GENERATION_DSH_TOOL_NAME,
  GENERATION_DSH_TOOL_PARAMETERS,
  decodeGenerationDshToolInput,
  projectGenerationJobSnapshot,
} from './dsh-tool';
import type { GenerationJobSnapshot } from './job/contracts';

describe('Generation DSH tool contract', () => {
  it('owns the exact model-facing operation envelope and camelCase request fields', () => {
    expect(GENERATION_DSH_TOOL_PARAMETERS.input.oneOf).toHaveLength(6);
    const serialized = JSON.stringify(GENERATION_DSH_TOOL_PARAMETERS);
    expect(serialized).toContain('negativePrompt');
    expect(serialized).toContain('aspectRatio');
    expect(serialized).toContain('purpose');
    expect(serialized).toContain('lifecycleMode');
    expect(serialized).not.toContain('negative_prompt');
    expect(serialized).not.toContain('aspect_ratio');
  });

  it('exposes model-bound submit, Host-bound ComfyUI submit and describe', () => {
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
    expect(
      decodeGenerationDshToolInput('submit-comfyui', {
        lifecycleMode: 'detached',
        workflow: { '3': { class_type: 'KSampler', inputs: { seed: 42 } } },
        outputKind: 'image',
        inputBindings: [],
      }),
    ).toEqual({
      operation: 'submit-comfyui',
      input: {
        lifecycleMode: 'detached',
        workflow: { '3': { class_type: 'KSampler', inputs: { seed: 42 } } },
        outputKind: 'image',
        inputBindings: [],
      },
    });
    expect(() => decodeGenerationDshToolInput('cancel', { jobId: 'job-1' })).toThrow(
      /must be one of submit, submit-comfyui, describe/,
    );
    expect(() =>
      decodeGenerationDshToolInput('describe', { jobId: 'job-1', include: 'result' }),
    ).toThrow(/input.include is not supported/);
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
      decodeGenerationDshToolInput('submit-comfyui', {
        lifecycleMode: 'detached',
        endpoint: 'http://127.0.0.1:8188',
        workflow: { '3': {} },
        outputKind: 'image',
        inputBindings: [],
      }),
    ).toThrow(/input.endpoint is not supported/);
    expect(() =>
      decodeGenerationDshToolInput('submit-comfyui', {
        lifecycleMode: 'detached',
        workflow: { '3': { class_type: 'LoadImage', inputs: { image: 'source.png' } } },
        outputKind: 'image',
        inputBindings: [
          {
            nodeId: '3',
            inputName: 'image',
            contentLocator: { file: { authority: 'workspace', path: 'source.png' } },
          },
          {
            nodeId: '3',
            inputName: 'image',
            contentLocator: { file: { authority: 'workspace', path: 'other.png' } },
          },
        ],
      }),
    ).toThrow(/duplicate exact node input/);
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

  it('projects bounded durable Job facts and canonical result locators without provider payloads', () => {
    const snapshot: GenerationJobSnapshot = {
      ref: { kind: 'generation', jobId: 'job-1' },
      phase: 'succeeded',
      createdAt: 1,
      updatedAt: 2,
      lifecycleMode: 'detached',
      request: {
        providerId: 'provider',
        modelId: 'model',
        generationType: 'text-to-image',
        request: { prompt: 'secret prompt', width: 1024 },
      },
      progress: { stage: 'completed', percent: 100 },
      providerTask: { providerId: 'provider', externalTaskId: 'provider-task-1' },
      resultLocators: [
        { file: { authority: 'workspace', path: 'neko/generated/job-1/image.png' } },
      ],
    };

    expect(projectGenerationJobSnapshot(snapshot)).toEqual({
      jobId: 'job-1',
      kind: 'generation',
      phase: 'succeeded',
      stage: 'completed',
      lifecycleMode: 'detached',
      generationType: 'text-to-image',
      createdAt: 1,
      updatedAt: 2,
      resultLocators: [
        { file: { authority: 'workspace', path: 'neko/generated/job-1/image.png' } },
      ],
    });
    expect(projectGenerationJobSnapshot(snapshot)).not.toHaveProperty('request');
    expect(projectGenerationJobSnapshot(snapshot)).not.toHaveProperty('providerTask');
  });
});

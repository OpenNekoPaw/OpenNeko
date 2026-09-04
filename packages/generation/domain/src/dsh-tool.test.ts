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
    expect(GENERATION_DSH_TOOL_PARAMETERS.input.oneOf).toHaveLength(5);
    const videoSubmitSchema = GENERATION_DSH_TOOL_PARAMETERS.input.oneOf.find(
      (candidate) => candidate.title === 'video submit input',
    );
    const imageSubmitSchema = GENERATION_DSH_TOOL_PARAMETERS.input.oneOf.find(
      (candidate) => candidate.title === 'image submit input',
    );
    expect(videoSubmitSchema).toMatchObject({
      properties: {
        request: {
          properties: {
            inputs: {
              items: {
                oneOf: [
                  { properties: { type: { const: 'image' } } },
                  { properties: { type: { const: 'video' } } },
                  { properties: { type: { const: 'audio' } } },
                ],
              },
            },
          },
        },
      },
    });
    const serialized = JSON.stringify(GENERATION_DSH_TOOL_PARAMETERS);
    expect(serialized).toContain('negativePrompt');
    expect(serialized).toContain('aspectRatio');
    expect(serialized).toContain('purpose');
    expect(serialized).toContain('lifecycleMode');
    expect(serialized).toContain('image-edit');
    expect(serialized).toContain('video-edit');
    expect(serialized).not.toContain('text-to-music');
    expect(imageSubmitSchema).toMatchObject({
      properties: {
        request: {
          properties: {
            operation: { enum: ['generate', 'edit', 'inpaint', 'style-transfer'] },
          },
        },
      },
    });
    expect(serialized).not.toContain('prepare-for-timeline');
    expect(serialized).not.toContain('negative_prompt');
    expect(serialized).not.toContain('aspect_ratio');
    expect(serialized).not.toContain('anyOf');
    expect(serialized).toContain('schema presence alone does not mean the model supports it');
    expect(serialized).toContain('generationType must match the request');
  });

  it('exposes model-bound submit and describe', () => {
    expect(GENERATION_DSH_TOOL_NAME).toBe('openneko_generation');
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
    expect(() =>
      decodeGenerationDshToolInput('describe', { jobId: 'job-1', include: 'result' }),
    ).toThrow(/input.include is not supported/);
  });

  it('accepts one explicit first-frame locator and rejects an empty selector', () => {
    const input = {
      purpose: 'video.generate',
      generationType: 'image-to-video',
      lifecycleMode: 'linked',
      request: {
        prompt: 'A slow upward push',
        operation: 'generate-from-image',
        duration: 6,
        aspectRatio: '16:9',
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: {
              file: { authority: 'workspace', path: 'neko/generated/image/first-frame.png' },
            },
            mimeType: 'image/png',
          },
        ],
      },
    } as const;

    expect(decodeGenerationDshToolInput('submit', input)).toEqual({
      operation: 'submit',
      input,
    });
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        ...input,
        request: {
          ...input.request,
          inputs: [
            {
              ...input.request.inputs[0],
              locator: {
                ...input.request.inputs[0].locator,
                selector: {},
              },
            },
          ],
        },
      }),
    ).toThrow(/generation type contract/);
  });

  it('accepts an EPUB entry as the source of an image edit and rejects outpaint', () => {
    const input = {
      purpose: 'image.edit',
      generationType: 'image-edit',
      lifecycleMode: 'linked',
      request: {
        prompt: 'Recompose the architecture into one wide environment frame.',
        operation: 'edit',
        editInstruction: 'Remove page layout and characters while preserving the architecture.',
        aspectRatio: '16:9',
        width: 2048,
        height: 1152,
        quality: 'hd',
        referenceImageLocator: {
          file: { authority: 'workspace', path: 'neko/assets/Blame/volume-01.epub' },
          selector: { kind: 'entry', path: 'image/page-1.jpg' },
        },
      },
    } as const;

    expect(decodeGenerationDshToolInput('submit', input)).toEqual({
      operation: 'submit',
      input,
    });
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        ...input,
        request: { ...input.request, operation: 'outpaint' },
      }),
    ).toThrow(/generation type contract/);
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
        purpose: 'audio.music.generate',
        generationType: 'text-to-music',
        lifecycleMode: 'detached',
        request: { prompt: 'score' },
      }),
    ).toThrow(/generation type contract/);
    expect(() =>
      decodeGenerationDshToolInput('submit', {
        purpose: 'image.generate',
        generationType: 'image-edit',
        lifecycleMode: 'detached',
        request: { prompt: 'edit' },
      }),
    ).toThrow(/purpose does not match/);
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

  it('projects visible parameter adjustments without exposing the generation request', () => {
    const snapshot: GenerationJobSnapshot = {
      ref: { kind: 'generation', jobId: 'job-video' },
      phase: 'pending',
      createdAt: 1,
      updatedAt: 1,
      lifecycleMode: 'detached',
      request: {
        providerId: 'minimax-provider',
        modelId: 'minimax-h3',
        generationType: 'image-to-video',
        parameterAdjustments: [
          { parameter: 'resolution', reason: 'invalid' },
          { parameter: 'fps', reason: 'unsupported' },
        ],
        request: {
          prompt: 'A slow upward push',
          providerId: 'minimax-provider',
          modelId: 'minimax-h3',
          duration: 6,
          resolution: '768P',
          aspectRatio: '16:9',
        },
      },
      progress: { stage: 'queued', percent: 0 },
    };

    expect(projectGenerationJobSnapshot(snapshot)).toMatchObject({
      jobId: 'job-video',
      parameterAdjustments: [
        { parameter: 'resolution', reason: 'invalid' },
        { parameter: 'fps', reason: 'unsupported' },
      ],
    });
    expect(projectGenerationJobSnapshot(snapshot)).not.toHaveProperty('request');
  });
});

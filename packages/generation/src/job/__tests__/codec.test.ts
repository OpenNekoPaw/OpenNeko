import { describe, expect, it } from 'vitest';
import type { GenerationJobSnapshot } from '../contracts';
import { decodeGenerationJobSnapshot, encodeGenerationJobSnapshot } from '../codec';

describe('Generation Job codec', () => {
  it('round-trips Prompt generation and caller submission identity', () => {
    const value: GenerationJobSnapshot = {
      ...snapshot(),
      submissionId: 'canvas-submission-1',
      request: {
        generationType: 'prompt',
        providerId: 'provider-1',
        modelId: 'text-model',
        request: {
          prompt: 'Write a scene',
          context: [{ sourceNodeId: 'notes-1', text: 'Rainy station', digest: 'sha256:notes' }],
          temperature: 0.4,
          maxOutputTokens: 800,
        },
      },
    };

    expect(decodeGenerationJobSnapshot(encodeGenerationJobSnapshot(value))).toEqual(value);
  });

  it('round-trips locator-backed durable requests', () => {
    const value: GenerationJobSnapshot = {
      ...snapshot(),
      request: {
        ...snapshot().request,
        generationType: 'image-to-image',
        request: {
          prompt: 'restyle the source',
          providerId: 'provider-1',
          modelId: 'image-model',
          referenceImageLocator: {
            kind: 'workspace-file',
            path: 'references/source.png',
          },
          ipAdapterRefs: [
            {
              imageLocator: {
                kind: 'workspace-file',
                path: 'references/appearance.png',
              },
              mode: 'subject',
            },
          ],
        },
      },
    };

    expect(decodeGenerationJobSnapshot(encodeGenerationJobSnapshot(value))).toEqual(value);
  });

  it.each([
    ['unknown field', { unexpectedField: 1 }],
    ['resultRefs', { resultRefs: [{ id: 'unsupported-result' }] }],
    [
      'runtime URI',
      {
        request: {
          ...snapshot().request,
          request: {
            ...snapshot().request.request,
            referenceImageUri: 'file:///tmp/source.png',
          },
        },
      },
    ],
    [
      'provider URL',
      {
        request: {
          ...snapshot().request,
          request: {
            ...snapshot().request.request,
            referenceVideoUrl: 'https://provider.invalid/source.mp4',
          },
        },
      },
    ],
    [
      'nested IP-Adapter base64',
      {
        request: {
          ...snapshot().request,
          request: {
            ...snapshot().request.request,
            ipAdapterRefs: [{ imageBase64: 'runtime-bytes', mode: 'subject' }],
          },
        },
      },
    ],
  ])('rejects removed %s payload fields at the record boundary', (_name, removedFields) => {
    const value = {
      ...snapshot(),
      ...removedFields,
    };

    expect(() => decodeGenerationJobSnapshot(JSON.stringify(value))).toThrow(
      expect.objectContaining({ code: 'generation-job-persistence-invalid' }),
    );
  });

  it('rejects an absolute path locator without inferring a workspace location', () => {
    const value = {
      ...snapshot(),
      request: {
        ...snapshot().request,
        generationType: 'image-to-image',
        request: {
          ...snapshot().request.request,
          referenceImageLocator: {
            kind: 'workspace-file',
            path: '/tmp/source.png',
          },
        },
      },
    };

    expect(() => decodeGenerationJobSnapshot(JSON.stringify(value))).toThrow(
      expect.objectContaining({ code: 'generation-job-persistence-invalid' }),
    );
  });

  it('round-trips regenerate provenance and rejects conflicting retry provenance', () => {
    const regenerated: GenerationJobSnapshot = {
      ...snapshot(),
      regenerateOf: { kind: 'generation', jobId: 'generation-previous' },
    };
    expect(decodeGenerationJobSnapshot(encodeGenerationJobSnapshot(regenerated))).toEqual(
      regenerated,
    );

    expect(() =>
      decodeGenerationJobSnapshot(
        JSON.stringify({
          ...regenerated,
          retryOf: { kind: 'generation', jobId: 'generation-retry-source' },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'generation-job-persistence-invalid' }));
  });
});

function snapshot(): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'generation-1' },
    lifecycleMode: 'detached',
    phase: 'pending',
    createdAt: 1,
    updatedAt: 1,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'image-model',
      request: {
        prompt: 'cat',
        providerId: 'provider-1',
        modelId: 'image-model',
      },
    },
    progress: { stage: 'queued', percent: 0 },
  };
}

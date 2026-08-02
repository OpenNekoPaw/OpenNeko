import { describe, expect, it } from 'vitest';
import type { GenerationJobSnapshot } from '../contracts';
import { decodeGenerationJobSnapshot, encodeGenerationJobSnapshot } from '../codec';

describe('Generation Job codec', () => {
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
    ['resultRefs', { resultRefs: [{ id: 'legacy-result' }] }],
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
    [
      'nested retired resource-reference fields',
      {
        request: {
          ...snapshot().request,
          request: {
            ...snapshot().request.request,
            ipAdapterRefs: [{ imageRef: { id: 'legacy-resource' }, mode: 'subject' }],
          },
        },
      },
    ],
  ])('rejects legacy %s payloads with a migration diagnostic', (_name, legacyFields) => {
    const value = {
      ...snapshot(),
      ...legacyFields,
    };

    expect(() => decodeGenerationJobSnapshot(JSON.stringify(value))).toThrow(
      expect.objectContaining({ code: 'generation-job-migration-required' }),
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
    revision: 1,
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

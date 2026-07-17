import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeMediaOperationRequest,
  NekoProjectAuthoringResult,
  ResourceRef,
} from '@neko/shared';
import type { CutProjectAuthoringImportedClip } from './CutProjectAuthoringService';
import { createCutTimelinePreparationAdapter } from './cutVideoOperationAdapter';

function resourceRef(overrides: Partial<ResourceRef> = {}): ResourceRef {
  return {
    id: 'asset:video:generated-clip',
    scope: 'project',
    provider: 'media-provider',
    kind: 'generated',
    source: { kind: 'generated-asset', generatedAssetId: 'generated-clip' },
    locator: { kind: 'generated-asset', assetId: 'generated-clip' },
    fingerprint: { strategy: 'provider', value: 'generated-clip:v1' },
    ...overrides,
  };
}

function request(
  overrides: Partial<CreativeMediaOperationRequest> = {},
): CreativeMediaOperationRequest {
  return {
    version: 1,
    requestId: 'prepare-clip-1',
    mediaKind: 'video',
    operationId: 'prepare-for-timeline',
    inputRefs: [],
    referenceVideoRef: resourceRef(),
    requestedDurationSeconds: 4,
    ...overrides,
  };
}

function successResult(): NekoProjectAuthoringResult<CutProjectAuthoringImportedClip> {
  return {
    version: 1,
    ok: true,
    diagnostics: [],
    data: {
      sourcePath: 'media/generated-clip.mp4',
      mediaType: 'video',
      trackId: 'track-1',
      elementId: 'clip-1',
      createdTrack: true,
      startTime: 0,
      duration: 4,
      sourceIngest: {
        ok: true,
        requestId: 'prepare-clip-1',
        durablePath: 'media/generated-clip.mp4',
        ingest: {
          status: 'ready',
          request: {
            mode: 'link',
            destination: { kind: 'project', directory: 'media', copyMode: 'link' },
          },
          contractedPath: 'media/generated-clip.mp4',
          source: { kind: 'file', path: 'media/generated-clip.mp4' },
          diagnostics: [],
        },
        diagnostics: [],
      },
    },
  };
}

describe('Cut single-clip timeline preparation adapter', () => {
  it('materializes a stable generated clip and delegates to headless Cut authoring', async () => {
    const importGeneratedClip = vi.fn(async () => successResult());
    const resolveResourcePath = vi.fn(async () => '/authorized/generated-clip.mp4');
    const adapter = createCutTimelinePreparationAdapter({
      authoring: { importGeneratedClip },
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
      resolveResourcePath,
      trackIndex: 0,
    });

    const result = await adapter.execute!(request());

    expect(result.status).toBe('succeeded');
    expect(resolveResourcePath).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asset:video:generated-clip' }),
    );
    expect(importGeneratedClip).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: '/authorized/generated-clip.mp4',
        mediaType: 'video',
        duration: 4,
        trackIndex: 0,
      }),
    );
  });

  it('rejects timeline-wide operations and runtime media identity', async () => {
    const importGeneratedClip = vi.fn(async () => successResult());
    const adapter = createCutTimelinePreparationAdapter({
      authoring: { importGeneratedClip },
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
      resolveResourcePath: vi.fn(async () => '/authorized/generated-clip.mp4'),
    });

    expect(await adapter.execute!(request({ operationId: 'retime' }))).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'operation-unsupported' })],
    });
    expect(
      (
        await adapter.execute!(
          request({
            referenceVideoRef: resourceRef({
              id: 'provider-task://runtime-1',
              source: { kind: 'remote-url', uri: 'blob:runtime-video' },
            }),
          }),
        )
      ).diagnostics,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'runtime-resource-identity' })]),
    );
    expect(importGeneratedClip).not.toHaveBeenCalled();
  });
});

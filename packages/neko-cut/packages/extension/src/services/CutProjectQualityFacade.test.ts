import { describe, expect, it, vi } from 'vitest';
import type {
  ProjectData,
  ProjectFileOps,
  ProjectQualityRequest,
  QualityProjectRef,
  ResourceRef,
} from '@neko/shared';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
} from '@neko/shared';
import { createNkvProjectRef, CutProjectQualityFacade } from './CutProjectQualityFacade';

describe('CutProjectQualityFacade', () => {
  it('validates the current disk revision and returns a stable snapshot', async () => {
    const document = createProject('media/clip.mp4');
    const project = createNkvProjectRef('file:///project/edit.nkv', document);
    const facade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/edit.nkv': JSON.stringify(document),
        '/project/media/clip.mp4': 'video',
      }),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    });

    const validated = await facade.validateProject(createRequest(project));
    const snapshot = await facade.getProjectSnapshot(createRequest(project));

    expect(validated).toMatchObject({
      ok: true,
      operation: 'validate-project',
      data: {
        revision: project.projectRevision,
        contentDigest: project.contentDigest,
        projectRef: project,
      },
    });
    expect(snapshot).toMatchObject({
      ok: true,
      operation: 'get-project-snapshot',
      data: {
        project,
        createdAt: '2026-07-11T00:00:00.000Z',
        snapshotRef: {
          provider: 'neko-cut',
          kind: 'document',
          fingerprint: { strategy: 'hash', value: project.contentDigest },
        },
      },
    });
  });

  it('prefers a target-bound live snapshot over stale disk content', async () => {
    const disk = createProject('media/disk.mp4', { name: 'Disk' });
    const live = createProject('media/live.mp4', { name: 'Live' });
    const project = createNkvProjectRef('file:///project/live.nkv', live);
    const snapshotSource = {
      getSnapshot: vi.fn(async () => ({ status: 'available' as const, document: live })),
    };
    const facade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/live.nkv': JSON.stringify(disk),
        '/project/media/live.mp4': 'video',
      }),
      snapshotSource,
    });

    const result = await facade.validateProject(createRequest(project));

    expect(result.ok).toBe(true);
    expect(snapshotSource.getSnapshot).toHaveBeenCalledWith({
      documentUri: 'file:///project/live.nkv',
    });
  });

  it('rejects stale revisions before review or export adapters can run', async () => {
    const document = createProject('media/clip.mp4');
    const current = createNkvProjectRef('file:///project/stale.nkv', document);
    const stale = { ...current, projectRevision: 'nkv:stale', contentDigest: 'stale' };
    const reviewRenderer = { renderReview: vi.fn() };
    const exportReadinessProbe = { check: vi.fn() };
    const facade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/stale.nkv': JSON.stringify(document),
        '/project/media/clip.mp4': 'video',
      }),
      reviewRenderer,
      exportReadinessProbe,
    });

    const preview = await facade.renderPreview(
      createRequest(stale, { startSeconds: 0, endSeconds: 1 }),
    );
    const readiness = await facade.checkExportReadiness(createRequest(stale));

    expect(preview).toMatchObject({
      ok: false,
      operation: 'render-preview',
      diagnostics: [expect.objectContaining({ code: 'stale-quality-evidence' })],
    });
    expect(readiness).toMatchObject({ ok: false, operation: 'check-export-readiness' });
    expect(reviewRenderer.renderReview).not.toHaveBeenCalled();
    expect(exportReadinessProbe.check).not.toHaveBeenCalled();
  });

  it('rejects invalid tracks, clips, runtime handles, missing resources, and out-of-range review targets', async () => {
    const duplicateTrack = createProject(undefined, {
      tracks: [createTrack('same', []), createTrack('same', [])],
    });
    const invalidClip = createProject(undefined, {
      tracks: [
        createTrack('track', [{ ...createMediaElement('clip', 'media/clip.mp4'), trimEnd: 1 }]),
      ],
    });
    const cases: readonly [string, ProjectData, string][] = [
      ['duplicate.nkv', duplicateTrack, 'track ids must be non-empty and unique'],
      ['invalid-clip.nkv', invalidClip, 'invalid timeline range or trims'],
      ['runtime.nkv', createProject('blob:preview'), 'runtime-only handle'],
      ['missing.nkv', createProject('media/missing.mp4'), 'is missing'],
    ];

    for (const [name, document, message] of cases) {
      const project = createNkvProjectRef(`file:///project/${name}`, document);
      const facade = new CutProjectQualityFacade({
        fileOps: createMemoryFileOps({ [`/project/${name}`]: JSON.stringify(document) }),
      });

      const result = await facade.validateProject(createRequest(project));

      expect(result.ok).toBe(false);
      expect(result.diagnostics.some((item) => item.message.includes(message))).toBe(true);
    }

    const rangeDocument = createProject(undefined);
    const rangeProject = createNkvProjectRef('file:///project/range.nkv', rangeDocument);
    const rangeFacade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/range.nkv': JSON.stringify(rangeDocument) }),
    });
    const rangeResult = await rangeFacade.validateProject(
      createRequest(rangeProject, { startSeconds: 0, endSeconds: 2 }),
    );
    expect(rangeResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ message: expect.stringContaining('beyond') })],
    });
  });

  it('validates audio/subtitle placement and uses effective trimmed duration for review ranges', async () => {
    const invalidSemantics = createProject(undefined, {
      tracks: [
        createTrack('video-track', [createAudioElement('audio-1', 'media/audio.wav')]),
        createTypedTrack('subtitle-track', 'subtitle', [
          createSubtitleElement('subtitle-1', '   '),
        ]),
      ],
    });
    const invalidProject = createNkvProjectRef(
      'file:///project/invalid-semantics.nkv',
      invalidSemantics,
    );
    const invalidFacade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/invalid-semantics.nkv': JSON.stringify(invalidSemantics),
        '/project/media/audio.wav': 'audio',
      }),
    });

    const invalidResult = await invalidFacade.validateProject(createRequest(invalidProject));

    expect(invalidResult.ok).toBe(false);
    expect(
      invalidResult.diagnostics.some((item) =>
        item.message.includes('incompatible with video track'),
      ),
    ).toBe(true);
    expect(
      invalidResult.diagnostics.some((item) =>
        item.message.includes('must contain non-empty text'),
      ),
    ).toBe(true);

    const trimmedClip = {
      ...createMediaElement('clip-1', 'media/clip.mp4'),
      duration: 10,
      trimStart: 2,
      trimEnd: 3,
    };
    const trimmedDocument = createProject(undefined, {
      tracks: [createTrack('video-track', [trimmedClip])],
    });
    const trimmedProject = createNkvProjectRef('file:///project/trimmed.nkv', trimmedDocument);
    const trimmedFacade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/trimmed.nkv': JSON.stringify(trimmedDocument),
        '/project/media/clip.mp4': 'video',
      }),
    });

    const rangeResult = await trimmedFacade.validateProject(
      createRequest(trimmedProject, { startSeconds: 0, endSeconds: 6 }),
    );

    expect(rangeResult).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ message: expect.stringContaining('5s timeline') })],
    });
  });

  it('passes the exact requested time range to the owning review renderer', async () => {
    const document = createProject('media/clip.mp4');
    const project = createNkvProjectRef('file:///project/render.nkv', document);
    const previewRef = createPreviewRef(project.contentDigest!);
    const reviewRenderer = {
      renderReview: vi.fn(async () => ({
        previewRef,
        sessionRenderUri: 'vscode-webview-resource://review/render.mp4',
      })),
    };
    const facade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/render.nkv': JSON.stringify(document),
        '/project/media/clip.mp4': 'video',
      }),
      reviewRenderer,
    });
    const mediaRange = { startSeconds: 0.25, endSeconds: 0.75 };

    const result = await facade.renderPreview(createRequest(project, mediaRange));

    expect(result).toMatchObject({
      ok: true,
      data: { previewRef, sessionRenderUri: 'vscode-webview-resource://review/render.mp4' },
    });
    expect(reviewRenderer.renderReview).toHaveBeenCalledWith(
      expect.objectContaining({ project, revision: project.projectRevision, mediaRange }),
    );
  });

  it('keeps formal export separate and reports adapter-owned output settings', async () => {
    const document = createProject('media/clip.mp4');
    const project = createNkvProjectRef('file:///project/export.nkv', document);
    const exportReadinessProbe = {
      check: vi.fn(async () => ({ ready: true, requiredEvidenceIds: ['preflight-1'] })),
    };
    const facade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({
        '/project/export.nkv': JSON.stringify(document),
        '/project/media/clip.mp4': 'video',
      }),
      exportReadinessProbe,
    });

    const result = await facade.checkExportReadiness(createRequest(project));

    expect(result).toMatchObject({
      ok: true,
      data: {
        ready: true,
        requiredEvidenceIds: ['preflight-1'],
        diagnostics: [
          expect.objectContaining({
            severity: 'warning',
            message: expect.stringContaining('container, codec, bitrate, and output path'),
          }),
        ],
      },
    });
    expect(exportReadinessProbe.check).toHaveBeenCalledOnce();
  });

  it('fails closed when a target-bound snapshot source reports unavailable', async () => {
    const document = createProject(undefined);
    const project = createNkvProjectRef('file:///project/unavailable.nkv', document);
    const facade = new CutProjectQualityFacade({
      fileOps: createMemoryFileOps({ '/project/unavailable.nkv': JSON.stringify(document) }),
      snapshotSource: {
        getSnapshot: vi.fn(async () => ({
          status: 'unavailable' as const,
          diagnostic: {
            code: 'quality-evaluator-failed' as const,
            severity: 'error' as const,
            message: 'Target-bound live snapshot is unavailable.',
          },
        })),
      },
    });

    const result = await facade.validateProject(createRequest(project));

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ message: 'Target-bound live snapshot is unavailable.' }),
      ],
    });
  });
});

function createRequest(
  project: QualityProjectRef,
  mediaRange?: { readonly startSeconds: number; readonly endSeconds: number },
): ProjectQualityRequest {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: 'request-1',
    project,
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'cut-project',
      kind: 'timeline-final-cut',
      projectRef: project,
      revision: project.projectRevision,
      ...(mediaRange ? { mediaRange } : {}),
    },
  };
}

function createProject(src?: string, overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Cut project',
    resolution: { width: 1920, height: 1080 },
    fps: 24,
    tracks: [createTrack('track-1', src ? [createMediaElement('clip-1', src)] : [])],
    ...overrides,
  };
}

function createTrack(
  id: string,
  elements: ProjectData['tracks'][number]['elements'],
): ProjectData['tracks'][number] {
  return {
    id,
    name: 'Video',
    type: 'video',
    elements,
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
  };
}

function createTypedTrack(
  id: string,
  type: ProjectData['tracks'][number]['type'],
  elements: ProjectData['tracks'][number]['elements'],
): ProjectData['tracks'][number] {
  return { ...createTrack(id, elements), type };
}

function createAudioElement(
  id: string,
  src: string,
): Extract<ProjectData['tracks'][number]['elements'][number], { type: 'audio' }> {
  const base = createMediaElement(id, src);
  return {
    ...base,
    type: 'audio',
    src,
  };
}

function createSubtitleElement(
  id: string,
  text: string,
): Extract<ProjectData['tracks'][number]['elements'][number], { type: 'subtitle' }> {
  const base = createMediaElement(id, 'unused');
  return {
    ...base,
    type: 'subtitle',
    text,
    fontSize: 48,
    color: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: 'transparent',
    textAlign: 'center',
    strokeColor: 'transparent',
    strokeWidth: 0,
  };
}

function createMediaElement(
  id: string,
  src: string,
): ProjectData['tracks'][number]['elements'][number] {
  return {
    id,
    name: 'Clip',
    type: 'media',
    src,
    mediaType: 'video',
    startTime: 0,
    duration: 1,
    trimStart: 0,
    trimEnd: 0,
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createPreviewRef(digest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-cut-review',
    kind: 'preview',
    source: { kind: 'preview-asset', previewAssetId: `cut-review-${digest}` },
    fingerprint: { strategy: 'hash', value: digest },
  });
}

function createMemoryFileOps(initial: Readonly<Record<string, string>>): ProjectFileOps {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  return {
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
      return encoder.encode(content);
    }),
    writeFile: vi.fn(async (filePath: string, content: Uint8Array) => {
      files.set(filePath, new TextDecoder().decode(content));
    }),
  };
}

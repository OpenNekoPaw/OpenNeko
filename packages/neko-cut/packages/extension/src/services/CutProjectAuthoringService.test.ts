import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type {
  CanvasCutDraftPayload,
  ProjectData,
  ProjectFileOps,
  ProjectSourceAddResult,
} from '@neko/shared';
import { scanNekoProjectAuthoringCoreDependencies } from '@neko/shared';
import { CutProjectAuthoringService } from './CutProjectAuthoringService';
import { createNkvProjectRef } from './CutProjectQualityFacade';
import { ProjectSessionService } from './ProjectSessionService';

describe('CutProjectAuthoringService', () => {
  it('creates file-backed NKV projects without opening a Webview', async () => {
    const fileOps = createMemoryFileOps();
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps));

    const result = await service.createProject({
      target: {
        kind: 'new',
        documentUri: 'file:///project/generated.nkv',
        title: 'Generated',
        reveal: false,
      },
      options: { name: 'Generated', width: 1280, height: 720, fps: 24 },
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/generated.nkv',
      created: true,
      revealed: false,
      target: { kind: 'new', created: true, reveal: false },
      projectRef: {
        domain: 'cut',
        documentUri: 'file:///project/generated.nkv',
        projectRevision: expect.stringMatching(/^nkv:/),
        contentDigest: expect.any(String),
      },
    });
    expect(fileOps.readText('/project/generated.nkv')).toContain('"name": "Generated"');
    expect(fileOps.readText('/project/generated.nkv')).toContain('"fps": 24');
  });

  it('updates explicit file targets through project-file IO', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(createProject('Before')),
    });
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps));

    const result = await service.updateProjectData({
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
      projectData: createProject('After', 'media/clip.mp4'),
    });

    expect(result.ok).toBe(true);
    expect(result.documentUri).toBe('file:///project/edit.nkv');
    expect(fileOps.readText('/project/edit.nkv')).toContain('"name": "After"');
    expect(fileOps.readText('/project/edit.nkv')).toContain('"src": "media/clip.mp4"');
  });

  it('fails create-new requests when the host adapter has not resolved documentUri', async () => {
    const service = new CutProjectAuthoringService(
      new ProjectSessionService(createMemoryFileOps()),
    );

    const result = await service.createProject({
      target: { kind: 'new', title: 'Needs adapter target' },
      options: { name: 'Needs adapter target' },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'workspace-required',
        message: 'Cut create-new authoring requires an adapter-resolved documentUri.',
      }),
    ]);
  });

  it('imports generated clips into explicit file targets without a Webview executor', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(createProject('Before')),
    });
    const ingestSource = vi.fn(async () =>
      createSourceResult({
        durablePath: 'media/generated.mp4',
        requestId: 'request-1',
      }),
    );
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      ingestSource,
      createId: createSequentialIdFactory(),
    });

    const result = await service.importGeneratedClip({
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv', reveal: false },
      sourcePath: '/project/media/generated.mp4',
      name: 'Generated Shot',
      mediaType: 'video',
      duration: 4,
      startTime: 12,
      requestId: 'request-1',
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/edit.nkv',
      created: false,
      revealed: false,
      data: {
        sourcePath: 'media/generated.mp4',
        mediaType: 'video',
        trackId: 'id-1',
        elementId: 'id-2',
        startTime: 12,
        duration: 4,
      },
    });
    expect(ingestSource).toHaveBeenCalledWith(
      'file:///project/edit.nkv',
      expect.objectContaining({
        requestId: 'request-1',
        sourcePath: '/project/media/generated.mp4',
        metadata: expect.objectContaining({
          sourceCommand: 'neko.cut.authoring.importGeneratedClip',
        }),
      }),
    );
    expect(fileOps.readText('/project/edit.nkv')).toContain('"src": "media/generated.mp4"');
    expect(fileOps.readText('/project/edit.nkv')).toContain('"startTime": 12');
  });

  it('rejects stale asynchronous imports before source ingest or project write', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(createProject('Current')),
    });
    const ingestSource = vi.fn(async () =>
      createSourceResult({ durablePath: 'media/generated.mp4', requestId: 'stale-request' }),
    );
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      ingestSource,
    });

    const result = await service.importGeneratedClip({
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
      expectedProjectRevision: 'nkv:stale',
      sourcePath: '/project/media/generated.mp4',
      requestId: 'stale-request',
    });

    expect(result).toMatchObject({
      ok: false,
      documentUri: 'file:///project/edit.nkv',
      diagnostics: [{ code: 'stale-project-revision' }],
    });
    expect(ingestSource).not.toHaveBeenCalled();
    expect(fileOps.writeFile).not.toHaveBeenCalled();
  });

  it('isolates concurrent authoring sessions by explicit document identity', async () => {
    const projectA = createProject('A');
    const projectB = createProject('B');
    const fileOps = createMemoryFileOps({
      '/project/a.nkv': JSON.stringify(projectA),
      '/project/b.nkv': JSON.stringify(projectB),
    });
    let signalAStarted: (() => void) | undefined;
    let releaseA: (() => void) | undefined;
    const aStarted = new Promise<void>((resolve) => {
      signalAStarted = resolve;
    });
    const aMayFinish = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const ingestSource = vi.fn(async (documentUri: string, request) => {
      if (documentUri.endsWith('/a.nkv')) {
        signalAStarted?.();
        await aMayFinish;
      }
      return createSourceResult({
        durablePath: documentUri.endsWith('/a.nkv') ? 'media/a.mp4' : 'media/b.mp4',
        requestId: request.requestId,
      });
    });
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      createProjectSession: () => new ProjectSessionService(fileOps),
      ingestSource,
      createId: createSequentialIdFactory(),
    });

    const importA = service.importGeneratedClip({
      target: { kind: 'file', documentUri: 'file:///project/a.nkv' },
      expectedProjectRevision: createNkvProjectRef('file:///project/a.nkv', projectA)
        .projectRevision,
      sourcePath: '/generated/a.mp4',
      requestId: 'request-a',
    });
    await aStarted;
    const importB = service.importGeneratedClip({
      target: { kind: 'file', documentUri: 'file:///project/b.nkv' },
      expectedProjectRevision: createNkvProjectRef('file:///project/b.nkv', projectB)
        .projectRevision,
      sourcePath: '/generated/b.mp4',
      requestId: 'request-b',
    });

    await expect(importB).resolves.toMatchObject({
      ok: true,
      documentUri: 'file:///project/b.nkv',
    });
    releaseA?.();
    await expect(importA).resolves.toMatchObject({
      ok: true,
      documentUri: 'file:///project/a.nkv',
    });
    expect(fileOps.readText('/project/a.nkv')).toContain('media/a.mp4');
    expect(fileOps.readText('/project/a.nkv')).not.toContain('media/b.mp4');
    expect(fileOps.readText('/project/b.nkv')).toContain('media/b.mp4');
    expect(fileOps.readText('/project/b.nkv')).not.toContain('media/a.mp4');
  });

  it('revalidates the frozen revision after asynchronous source ingest', async () => {
    const original = createProject('Original');
    const externallyEdited = createProject('Externally edited');
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(original),
    });
    const ingestSource = vi.fn(async (_documentUri: string, request) => {
      await fileOps.writeFile(
        '/project/edit.nkv',
        new TextEncoder().encode(JSON.stringify(externallyEdited)),
      );
      return createSourceResult({
        durablePath: 'media/generated.mp4',
        requestId: request.requestId,
      });
    });
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      createProjectSession: () => new ProjectSessionService(fileOps),
      ingestSource,
    });

    const result = await service.importGeneratedClip({
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
      expectedProjectRevision: createNkvProjectRef('file:///project/edit.nkv', original)
        .projectRevision,
      sourcePath: '/generated/generated.mp4',
      requestId: 'request-revalidate',
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'stale-project-revision' }],
    });
    expect(fileOps.readText('/project/edit.nkv')).toContain('Externally edited');
    expect(fileOps.readText('/project/edit.nkv')).not.toContain('media/generated.mp4');
  });

  it('creates a new NKV file before importing generated image bytes', async () => {
    const fileOps = createMemoryFileOps();
    const ingestSource = vi.fn(async (_documentUri, request) =>
      createSourceResult({
        durablePath: 'media/generated.png',
        requestId: request.requestId,
      }),
    );
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      ingestSource,
      createId: createSequentialIdFactory(),
    });

    const result = await service.importGeneratedClip({
      target: {
        kind: 'new',
        documentUri: 'file:///project/generated.nkv',
        title: 'Generated Timeline',
        reveal: false,
      },
      bytes: new Uint8Array([1, 2, 3]),
      name: 'frame',
      mediaType: 'image',
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/generated.nkv',
      created: true,
      data: {
        sourcePath: 'media/generated.png',
        mediaType: 'image',
        duration: 3,
      },
    });
    expect(fileOps.readText('/project/generated.nkv')).toContain('"name": "Generated Timeline"');
    expect(fileOps.readText('/project/generated.nkv')).toContain('"src": "media/generated.png"');
    expect(fileOps.readText('/project/generated.nkv')).toContain('"duration": 3');
  });

  it('returns source diagnostics when generated clip ingest cannot produce a durable path', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nkv': JSON.stringify(createProject('Before')),
    });
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      ingestSource: vi.fn(async () => createFailedSourceResult()),
    });

    const result = await service.importGeneratedClip({
      target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
      sourcePath: 'blob:runtime',
      requestId: 'request-1',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'runtime-handle-persisted',
        message: 'Runtime source rejected.',
      }),
    ]);
    expect(fileOps.readText('/project/edit.nkv')).not.toContain('blob:runtime');
  });

  it('imports regular media sources into explicit file targets without a Webview executor', async () => {
    const fileOps = createMemoryFileOps({
      '/project/media.nkv': JSON.stringify(createProject('Media')),
    });
    const ingestSource = vi.fn(async () =>
      createSourceResult({
        durablePath: 'media/source.mov',
        requestId: 'media-request-1',
      }),
    );
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      ingestSource,
      createId: createSequentialIdFactory(),
    });

    const result = await service.importMediaSource({
      target: { kind: 'file', documentUri: 'file:///project/media.nkv' },
      sourcePath: '/project/media/source.mov',
      name: 'Source',
      mediaType: 'video',
      requestId: 'media-request-1',
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/media.nkv',
      data: {
        sourcePath: 'media/source.mov',
        mediaType: 'video',
      },
    });
    expect(ingestSource).toHaveBeenCalledWith(
      'file:///project/media.nkv',
      expect.objectContaining({
        kind: 'programmatic',
        sourcePath: '/project/media/source.mov',
        metadata: expect.objectContaining({
          sourceCommand: 'neko.cut.authoring.addSourceToTimeline',
        }),
      }),
    );
    expect(fileOps.readText('/project/media.nkv')).toContain('"src": "media/source.mov"');
  });

  it('saves and reopens headless media imports from project-file state', async () => {
    const fileOps = createMemoryFileOps({
      '/project/reopen.nkv': JSON.stringify(createProject('Reopen')),
    });
    const ingestSource = vi.fn(async () =>
      createSourceResult({
        durablePath: 'media/reopen.mp4',
        requestId: 'reopen-request',
      }),
    );
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      ingestSource,
      createId: createSequentialIdFactory(),
    });

    const imported = await service.importMediaSource({
      target: { kind: 'file', documentUri: 'file:///project/reopen.nkv' },
      sourcePath: '/project/media/reopen.mp4',
      mediaType: 'video',
      requestId: 'reopen-request',
    });

    const reopened = await new CutProjectAuthoringService(
      new ProjectSessionService(fileOps),
    ).loadProject({
      target: { kind: 'file', documentUri: 'file:///project/reopen.nkv' },
    });

    expect(imported.projectRef).toEqual(reopened.projectRef);
    expect(reopened.ok).toBe(true);
    expect(reopened.data?.tracks.flatMap((track) => track.elements)).toEqual([
      expect.objectContaining({ src: 'media/reopen.mp4' }),
    ]);
  });

  it('imports storyboard payloads through project-file IO and returns timeline refs', async () => {
    const fileOps = createMemoryFileOps({
      '/project/storyboard.nkv': JSON.stringify(createProject('Storyboard')),
    });
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      createId: createSequentialIdFactory(),
    });

    const result = await service.importStoryboard({
      target: { kind: 'file', documentUri: 'file:///project/storyboard.nkv' },
      payload: {
        projectName: 'Storyboard',
        shots: [
          {
            id: 'shot-a',
            shotNumber: 1,
            duration: 5,
            imagePath: 'media/shot-a.png',
            dialogue: 'Hello',
            label: 'Shot A',
          },
        ],
      },
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/storyboard.nkv',
      data: {
        projectName: 'Storyboard',
        shotCount: 1,
        refs: [
          { kind: 'media', shotId: 'shot-a', trackId: 'id-1', elementId: 'id-2' },
          { kind: 'dialogue', shotId: 'shot-a', trackId: 'id-3', elementId: 'id-4' },
        ],
      },
    });
    expect(fileOps.readText('/project/storyboard.nkv')).toContain('"src": "media/shot-a.png"');
    expect(fileOps.readText('/project/storyboard.nkv')).toContain('"text": "Hello"');
  });

  it('projects Canvas drafts to storyboard timeline facts without a Webview', async () => {
    const fileOps = createMemoryFileOps();
    const service = new CutProjectAuthoringService(new ProjectSessionService(fileOps), {
      createId: createSequentialIdFactory(),
    });

    const result = await service.importCanvasDraft({
      target: {
        kind: 'new',
        documentUri: 'file:///project/canvas-route.nkv',
        title: 'Canvas Route',
      },
      payload: createCanvasDraftPayload(),
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/canvas-route.nkv',
      created: true,
      data: {
        projectName: 'Canvas Route',
        shotCount: 1,
        syncPayload: {
          source: 'neko-cut',
          reason: 'storyboard-import',
          shots: [{ shotId: 'node-a', selectedInTimeline: true }],
        },
      },
    });
    expect(fileOps.readText('/project/canvas-route.nkv')).toContain('"name": "Canvas Route"');
    expect(fileOps.readText('/project/canvas-route.nkv')).toContain('"src": "media/shot-a.mp4"');
  });

  it('keeps the Cut authoring service free of UI adapter dependencies', () => {
    const source = readFileSync(
      new URL('./CutProjectAuthoringService.ts', import.meta.url),
      'utf-8',
    );

    expect(scanNekoProjectAuthoringCoreDependencies(source)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });
});

function createProject(name: string, src?: string): ProjectData {
  return {
    version: '2.0',
    name,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: src
      ? [
          {
            id: 'track-1',
            name: 'Main',
            type: 'media',
            muted: false,
            locked: false,
            hidden: false,
            isMain: true,
            elements: [
              {
                id: 'element-1',
                type: 'media',
                name: 'Clip',
                src,
                duration: 1,
                startTime: 0,
                trimStart: 0,
                trimEnd: 0,
                transform: {
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0,
                  anchorY: 0,
                },
                opacity: 1,
                blendMode: 'normal',
                effects: [],
                muted: false,
                hidden: false,
                locked: false,
              },
            ],
          },
        ]
      : [],
  };
}

function createMemoryFileOps(initial: Record<string, string> = {}): ProjectFileOps & {
  readText(filePath: string): string;
  writeFile: ReturnType<typeof vi.fn>;
} {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const files = new Map(Object.entries(initial));
  const fileOps = {
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`Missing file: ${filePath}`);
      return encoder.encode(content);
    }),
    writeFile: vi.fn(async (filePath: string, content: Uint8Array) => {
      files.set(filePath, decoder.decode(content));
    }),
    renameFile: vi.fn(async (fromPath: string, toPath: string) => {
      const content = files.get(fromPath);
      if (content === undefined) throw new Error(`Missing file: ${fromPath}`);
      files.set(toPath, content);
      files.delete(fromPath);
    }),
    deleteFile: vi.fn(async (filePath: string) => {
      files.delete(filePath);
    }),
    readText(filePath: string): string {
      return files.get(filePath) ?? '';
    },
  };
  return fileOps;
}

function createSourceResult(input: {
  readonly durablePath: string;
  readonly requestId: string;
}): ProjectSourceAddResult {
  return {
    requestId: input.requestId,
    ok: true,
    durablePath: input.durablePath,
    diagnostics: [],
  };
}

function createSequentialIdFactory(): () => string {
  let nextId = 1;
  return () => `id-${nextId++}`;
}

function createFailedSourceResult(): ProjectSourceAddResult {
  return {
    requestId: 'request-1',
    ok: false,
    diagnostics: [
      {
        code: 'runtime-handle-persisted',
        severity: 'error',
        message: 'Runtime source rejected.',
      },
    ],
  };
}

function createCanvasDraftPayload(): CanvasCutDraftPayload {
  return {
    kind: 'canvas-cut-draft',
    schemaVersion: 1,
    source: { canvasUri: 'file:///workspace/story.nkc', revision: 1 },
    route: {
      id: 'route-main',
      title: 'Main route',
      entryUnitId: 'unit-a',
      unitIds: ['unit-a'],
      sourceKind: 'auto-entry',
    },
    projectName: 'Canvas Route',
    units: [
      {
        id: 'unit-a',
        kind: 'shot',
        renderMode: 'story-preview',
        durationMs: 4000,
        sourceMapping: {
          routeId: 'route-main',
          canvasUnitId: 'unit-a',
          canvasNodeId: 'node-a',
          canvasUnitKind: 'shot',
        },
        media: [{ role: 'source', assetPath: 'media/shot-a.mp4' }],
      },
    ],
  };
}

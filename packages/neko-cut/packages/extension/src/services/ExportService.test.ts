import { describe, expect, it, vi } from 'vitest';
import type { ActionRequest, ActionResponse } from '@neko/neko-client';
import type { ContentAccessRequest, ContentAccessResult, ProjectData } from '@neko/shared';
import { ExportService, type ExportConfig } from './ExportService';

vi.mock('vscode', () => ({
  EventEmitter: class<T> {
    event = vi.fn();
    fire = vi.fn((_value?: T) => undefined);
    dispose = vi.fn();
  },
  workspace: {
    workspaceFolders: [
      { uri: { fsPath: '/workspace/a' }, name: 'a', index: 0 },
      { uri: { fsPath: '/workspace/project' }, name: 'project', index: 1 },
    ],
  },
  extensions: {
    getExtension: vi.fn(() => undefined),
  },
}));

describe('ExportService', () => {
  it('resolves media sources through final-export content access before engine dispatch', async () => {
    const requests: ContentAccessRequest[] = [];
    const dispatched: ActionRequest[] = [];
    const service = new ExportService(createEngineClient(dispatched), '/workspace/project', {
      fileExists: () => true,
      contentAccess: {
        registerProvider: vi.fn(),
        resolve: async (request) => {
          requests.push(request);
          return {
            status: 'ready',
            request,
            localPath: '/source/original/clip.mp4',
          } satisfies ContentAccessResult;
        },
      },
    });

    await service.startExport(createProject('/workspace/project/proxies/clip-proxy.mp4'), {
      outputPath: '/exports/final.mp4',
      format: 'mp4',
      width: 1920,
      height: 1080,
      fps: 24,
      quality: 'high',
      audioBitrate: 192_000,
    });

    expect(requests).toEqual([
      expect.objectContaining({
        intent: 'final-export',
        target: 'local-path',
        ref: { kind: 'file', path: '/workspace/project/proxies/clip-proxy.mp4' },
      }),
    ]);
    expect(dispatched[0]).toMatchObject({
      group: 'timelines',
      action: 'export_enqueue',
      body: {
        timeline: {
          tracks: [
            {
              elements: [
                {
                  type: 'media',
                  src: '/source/original/clip.mp4',
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('passes explicit draft-proxy quality mode into export content access diagnostics', async () => {
    const requests: ContentAccessRequest[] = [];
    const service = new ExportService(createEngineClient([]), '/workspace/project', {
      fileExists: () => true,
      contentAccess: {
        registerProvider: vi.fn(),
        resolve: async (request) => {
          requests.push(request);
          return {
            status: 'ready',
            request,
            localPath: '/workspace/project/proxies/clip-proxy.mp4',
          } satisfies ContentAccessResult;
        },
      },
    });

    await service.startExport(createProject('proxies/clip-proxy.mp4'), {
      outputPath: '/exports/draft.mp4',
      format: 'mp4',
      width: 1280,
      height: 720,
      fps: 24,
      quality: 'low',
      audioBitrate: 128_000,
      qualityMode: 'draft-proxy',
    });

    expect(requests[0]).toMatchObject({
      intent: 'final-export',
      qualityMode: 'draft-proxy',
      ref: { kind: 'file', path: '/workspace/project/proxies/clip-proxy.mp4' },
    });
  });

  it('resolves workspace-relative media from the owning workspace before final export', async () => {
    const requests: ContentAccessRequest[] = [];
    const dispatched: ActionRequest[] = [];
    const service = new ExportService(
      createEngineClient(dispatched),
      '/workspace/project/edit',
      {
        fileExists: (filePath) => filePath === '/workspace/project/cases/clip.mp4',
        contentAccess: {
          registerProvider: vi.fn(),
          resolve: async (request) => {
            requests.push(request);
            return {
              status: 'ready',
              request,
              localPath: '/workspace/project/cases/clip.mp4',
            } satisfies ContentAccessResult;
          },
        },
      },
      {
        scheme: 'file',
        fsPath: '/workspace/project/edit/project.nkv',
        toString: () => 'file:///workspace/project/edit/project.nkv',
      } as never,
    );

    await service.startExport(createProject('cases/clip.mp4'), {
      outputPath: '/exports/final.mp4',
      format: 'mp4',
      width: 1920,
      height: 1080,
      fps: 24,
      quality: 'high',
      audioBitrate: 192_000,
    });

    expect(requests[0]).toMatchObject({
      intent: 'final-export',
      ref: { kind: 'file', path: '/workspace/project/cases/clip.mp4' },
    });
  });

  it('stages completed export outputs through the ingest boundary', async () => {
    const staged: string[] = [];
    const service = new ExportService(createEngineClient([]), '/workspace/project', {
      contentIngest: {
        registerProvider: vi.fn(),
        ingest: async (request) => {
          staged.push(`${request.destination.directory}/${request.fileName}`);
          return {
            status: 'ready',
            request,
            outputPath: `${request.destination.directory}/${request.fileName}`,
            stagedOutput: {
              path: `${request.destination.directory}/${request.fileName}`,
              kind: 'export',
            },
          };
        },
      },
    });

    await (
      service as unknown as {
        stageExportOutput(outputPath: string): Promise<void>;
      }
    ).stageExportOutput('/exports/final.mp4');

    expect(staged).toEqual(['/exports/final.mp4']);
  });
});

function createEngineClient(dispatched: ActionRequest[]) {
  return {
    dispatch: vi.fn(async (request: ActionRequest): Promise<ActionResponse> => {
      dispatched.push(request);
      return { status: 'ok', data: { jobId: 'job-1' } } as ActionResponse;
    }),
  } as never;
}

function createProject(src: string): ProjectData {
  return {
    version: '1',
    name: 'Cut',
    resolution: { width: 1920, height: 1080 },
    fps: 24,
    tracks: [
      {
        id: 'track-1',
        name: 'Video',
        type: 'video',
        elements: [
          {
            id: 'clip-1',
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
          },
        ],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
  };
}

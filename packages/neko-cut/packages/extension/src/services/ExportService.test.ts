import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ActionRequest, ActionResponse } from '@neko/neko-client';
import type { ContentLocator, ProjectData } from '@neko/shared';
import { ExportService } from './ExportService';

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
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cut-export-'));
    await Promise.all([
      fs.mkdir(path.join(workspaceRoot, 'proxies'), { recursive: true }),
      fs.mkdir(path.join(workspaceRoot, 'cases'), { recursive: true }),
      fs.mkdir(path.join(workspaceRoot, 'edit'), { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(path.join(workspaceRoot, 'proxies', 'clip-proxy.mp4'), 'proxy'),
      fs.writeFile(path.join(workspaceRoot, 'cases', 'clip.mp4'), 'clip'),
    ]);
    (vscode.workspace as unknown as { workspaceFolders: unknown[] }).workspaceFolders = [
      { uri: { fsPath: workspaceRoot }, name: 'project', index: 0 },
    ];
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('authorizes media sources through ContentReadService before engine dispatch', async () => {
    const locators: ContentLocator[] = [];
    const dispatched: ActionRequest[] = [];
    const service = new ExportService(createEngineClient(dispatched), workspaceRoot, {
      fileExists: () => true,
      contentRead: {
        stat: async (locator) => {
          locators.push(locator);
          return {
            status: 'ready',
            locator,
            byteLength: 5,
            fingerprint: { strategy: 'mtime-size', value: '1:5' },
          } as const;
        },
        read: vi.fn(),
      },
    });

    await service.startExport(createProject('proxies/clip-proxy.mp4'), {
      outputPath: '/exports/final.mp4',
      format: 'mp4',
      width: 1920,
      height: 1080,
      fps: 24,
      quality: 'high',
      audioBitrate: 192_000,
    });

    expect(locators).toEqual([{ kind: 'workspace-file', path: 'proxies/clip-proxy.mp4' }]);
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
                  src: path.join(workspaceRoot, 'proxies', 'clip-proxy.mp4'),
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('does not add quality routing to source read authorization', async () => {
    const locators: ContentLocator[] = [];
    const service = new ExportService(createEngineClient([]), workspaceRoot, {
      fileExists: () => true,
      contentRead: {
        stat: async (locator) => {
          locators.push(locator);
          return {
            status: 'ready',
            locator,
            byteLength: 5,
            fingerprint: { strategy: 'mtime-size', value: '1:5' },
          } as const;
        },
        read: vi.fn(),
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

    expect(locators).toEqual([{ kind: 'workspace-file', path: 'proxies/clip-proxy.mp4' }]);
  });

  it('resolves workspace-relative media from the owning workspace before final export', async () => {
    const locators: ContentLocator[] = [];
    const dispatched: ActionRequest[] = [];
    const service = new ExportService(
      createEngineClient(dispatched),
      path.join(workspaceRoot, 'edit'),
      {
        fileExists: (filePath) => filePath === path.join(workspaceRoot, 'cases', 'clip.mp4'),
        contentRead: {
          stat: async (locator) => {
            locators.push(locator);
            return {
              status: 'ready',
              locator,
              byteLength: 4,
              fingerprint: { strategy: 'mtime-size', value: '1:4' },
            } as const;
          },
          read: vi.fn(),
        },
      },
      {
        scheme: 'file',
        fsPath: path.join(workspaceRoot, 'edit', 'project.nkv'),
        toString: () => `file://${path.join(workspaceRoot, 'edit', 'project.nkv')}`,
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

    expect(locators).toEqual([{ kind: 'workspace-file', path: 'cases/clip.mp4' }]);
  });

  it('prepares completed export output through the export owner', async () => {
    const staged: string[] = [];
    const service = new ExportService(createEngineClient([]), '/workspace/project', {
      prepareOutputDirectory: async (directory) => {
        staged.push(directory);
      },
    });

    await (
      service as unknown as {
        stageExportOutput(outputPath: string): Promise<void>;
      }
    ).stageExportOutput('/exports/final.mp4');

    expect(staged).toEqual(['/exports']);
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

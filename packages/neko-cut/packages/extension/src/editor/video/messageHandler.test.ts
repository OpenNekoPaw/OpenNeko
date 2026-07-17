import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '@neko/shared';
import { MessageHandler } from './messageHandler';
import { prepareCutProjectFileSave, saveCutProjectFile } from './cutProjectFilePersistence';

const fileContents = vi.hoisted(() => new Map<string, Uint8Array>());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => `file://${filePath}`,
    }),
  },
  window: {
    showSaveDialog: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' } }],
    fs: {
      stat: vi.fn(async (uri: { fsPath: string }) => {
        if (!fileContents.has(uri.fsPath)) {
          throw new Error(`Missing file: ${uri.fsPath}`);
        }
        return { type: 1 };
      }),
      createDirectory: vi.fn(async (_uri: { fsPath: string }) => undefined),
      copy: vi.fn(async (source: { fsPath: string }, target: { fsPath: string }) => {
        const content = fileContents.get(source.fsPath);
        if (!content) throw new Error(`Missing source: ${source.fsPath}`);
        fileContents.set(target.fsPath, content);
      }),
      writeFile: vi.fn(async (uri: { fsPath: string }, content: Uint8Array) => {
        fileContents.set(uri.fsPath, content);
      }),
    },
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

vi.mock('../../base', () => ({
  createServiceId: vi.fn((id: string) => id),
  getService: vi.fn(() => null),
  getLogger: () => ({
    info: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./cutProjectFilePersistence', () => {
  const prepareCutProjectFileSave = vi.fn(async (_uri: unknown, project: ProjectData) => ({
    ok: true,
    document: project,
    content: `${JSON.stringify(project)}\n`,
    diagnostics: [],
  }));
  const saveCutProjectFile = vi.fn(async (_uri: unknown, project: ProjectData) => ({
    ok: true,
    document: project,
    diagnostics: [],
  }));
  return {
    prepareCutProjectFileSave,
    saveCutProjectFile,
  };
});

describe('MessageHandler save', () => {
  let webview: { postMessage: ReturnType<typeof vi.fn> };
  let model: {
    uri: { fsPath: string };
    updateProjectData: ReturnType<typeof vi.fn>;
    syncSavedProjectData: ReturnType<typeof vi.fn>;
    applyIncrementalUpdate: ReturnType<typeof vi.fn>;
    getProjectData: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    fileContents.clear();
    loggerWarnMock.mockClear();
    vi.mocked(saveCutProjectFile).mockReset();
    vi.mocked(prepareCutProjectFileSave).mockReset();
    vi.mocked(prepareCutProjectFileSave).mockImplementation(async (_uri, project) => ({
      ok: true,
      document: project,
      content: `${JSON.stringify(project)}\n`,
      diagnostics: [],
    }));
    vi.mocked(saveCutProjectFile).mockImplementation(async (_uri, project) => ({
      ok: true,
      document: project,
      diagnostics: [],
    }));
    webview = { postMessage: vi.fn() };
    model = {
      uri: { fsPath: '/workspace/project/test.nkv' },
      updateProjectData: vi.fn(async () => true),
      syncSavedProjectData: vi.fn(async () => true),
      applyIncrementalUpdate: vi.fn(),
      getProjectData: vi.fn(() => createProject()),
    };
  });

  it('syncs the normalized snapshot then lets the provider save the custom document', async () => {
    const handler = createHandler();
    const project = createProject();

    await handler.handleMessage({ type: 'save', content: project });

    expect(prepareCutProjectFileSave).toHaveBeenCalledWith(model.uri, project);
    expect(saveCutProjectFile).not.toHaveBeenCalled();
    expect(model.syncSavedProjectData).toHaveBeenCalledWith(project);
    expect(model.applyIncrementalUpdate).not.toHaveBeenCalled();
    expect(model.updateProjectData).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'saved' }),
    );
  });

  it('reports an error when project snapshot normalization rejects the save', async () => {
    vi.mocked(prepareCutProjectFileSave).mockResolvedValue({
      ok: false,
      diagnostics: [
        {
          code: 'non-portable-path',
          severity: 'error',
          message: 'Source clip is not portable.',
        },
      ],
    });
    const handler = createHandler();

    await handler.handleMessage({ type: 'save', content: createProject() });

    expect(model.updateProjectData).not.toHaveBeenCalled();
    expect(model.syncSavedProjectData).not.toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'Failed to save project: Source clip is not portable.',
    });
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'saved' }),
    );
  });

  it('does not bypass VS Code dirty-state cleanup with direct project file writes', async () => {
    const normalized = createProject();
    normalized.name = 'Normalized';
    vi.mocked(prepareCutProjectFileSave).mockResolvedValue({
      ok: true,
      document: normalized,
      content: `${JSON.stringify(normalized)}\n`,
      diagnostics: [],
    });
    const handler = createHandler();

    await handler.handleMessage({ type: 'save', content: createProject() });

    expect(model.syncSavedProjectData).toHaveBeenCalledWith(normalized);
    expect(model.applyIncrementalUpdate).not.toHaveBeenCalled();
    expect(model.updateProjectData).not.toHaveBeenCalled();
    expect(saveCutProjectFile).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'saved' }),
    );
  });

  it('syncs project-changed snapshots into the text document without writing the file', async () => {
    const handler = createHandler();
    const project = createProject();
    const normalized = createProject();
    normalized.tracks = [
      {
        id: 'media-track',
        name: 'Media Track',
        type: 'media',
        elements: [
          {
            id: 'clip-1',
            type: 'media',
            name: 'clip.mp4',
            src: 'media/clip.mp4',
            startTime: 0,
            duration: 5,
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
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      },
    ];
    vi.mocked(prepareCutProjectFileSave).mockResolvedValue({
      ok: true,
      document: normalized,
      content: `${JSON.stringify(normalized)}\n`,
      diagnostics: [],
    });

    await handler.handleMessage({
      type: 'project:changed',
      document: project,
    });

    expect(prepareCutProjectFileSave).toHaveBeenCalledWith(model.uri, project);
    expect(saveCutProjectFile).not.toHaveBeenCalled();
    expect(model.syncSavedProjectData).toHaveBeenCalledWith(normalized);
    expect(model.applyIncrementalUpdate).not.toHaveBeenCalled();
  });

  it('keeps operation-applied messages out of the text document save source of truth', async () => {
    const handler = createHandler();

    await handler.handleMessage({
      type: 'operationApplied',
      operation: {
        type: 'track.add',
        meta: { id: 'op-track', timestamp: 1, source: 'user' },
        payload: {
          track: {
            id: 'media-track',
            name: 'Media Track',
            type: 'media',
            elements: [],
            muted: false,
            locked: false,
            hidden: false,
            isMain: false,
          },
        },
      },
    });

    expect(prepareCutProjectFileSave).not.toHaveBeenCalled();
    expect(saveCutProjectFile).not.toHaveBeenCalled();
    expect(model.syncSavedProjectData).not.toHaveBeenCalled();
    expect(model.applyIncrementalUpdate).not.toHaveBeenCalled();
  });

  it('ignores project-file snapshot responses handled by the save snapshot waiter', async () => {
    const handler = createHandler();

    await handler.handleMessage({
      type: 'projectFile:snapshot',
      requestId: 'snapshot-1',
      ok: true,
      document: createProject(),
    } as never);

    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(prepareCutProjectFileSave).not.toHaveBeenCalled();
    expect(model.syncSavedProjectData).not.toHaveBeenCalled();
  });

  it('registers project add-source requests and posts durable source results', async () => {
    const handler = createHandler();

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-1',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: {
          kind: 'project',
          projectRoot: '/workspace/project',
          copyMode: 'register',
        },
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceAdded',
        result: expect.objectContaining({
          ok: true,
          durablePath: 'media/clip.mp4',
        }),
      }),
    );
    expect(webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fileAdded' }),
    );
  });

  it('creates project media assets from browser file bytes before returning a durable source', async () => {
    const handler = createHandler();
    const bytes = new TextEncoder().encode('video-bytes');

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-2',
        kind: 'drag-drop',
        formatId: 'nkv',
        browserFile: { name: 'clip.mp4', type: 'video/mp4', size: bytes.byteLength },
        bytes,
        destination: {
          kind: 'project',
          directory: 'media',
          copyMode: 'copy',
        },
        ingestMode: 'create-asset',
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceAdded',
        result: expect.objectContaining({
          ok: true,
          durablePath: 'media/clip.mp4',
        }),
      }),
    );
    expect(fileContents.get('/workspace/project/media/clip.mp4')).toEqual(bytes);
  });

  it('normalizes message-boundary byte arrays before creating browser file assets', async () => {
    const handler = createHandler();
    const bytes = Array.from(new TextEncoder().encode('video-bytes'));

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-2b',
        kind: 'drag-drop',
        formatId: 'nkv',
        browserFile: { name: 'clip.mp4', type: 'video/mp4', size: bytes.length },
        bytes,
        destination: {
          kind: 'project',
          directory: 'media',
          copyMode: 'copy',
        },
        ingestMode: 'create-asset',
      },
    } as never);

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceAdded',
        result: expect.objectContaining({
          ok: true,
          durablePath: 'media/clip.mp4',
        }),
      }),
    );
    expect(fileContents.get('/workspace/project/media/clip.mp4')).toEqual(Uint8Array.from(bytes));
  });

  it('rejects unmanaged external dropped files instead of copying them into project media', async () => {
    const handler = createHandler();
    const bytes = new TextEncoder().encode('external-video');
    fileContents.set('/downloads/clip.mp4', bytes);

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-3',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/downloads/clip.mp4',
        browserFile: { name: 'clip.mp4', type: 'video/mp4' },
        destination: {
          kind: 'project',
          directory: 'media',
          copyMode: 'link',
        },
        ingestMode: 'link',
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceRejected',
        result: expect.objectContaining({
          ok: false,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              code: 'non-portable-path',
              message: expect.stringContaining('must be moved into the project'),
            }),
          ]),
        }),
      }),
    );
    expect(fileContents.has('/workspace/project/media/clip.mp4')).toBe(false);
  });

  it('reports add-source failures instead of leaving the webview waiting', async () => {
    const handler = createHandler();

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-3b',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/downloads/missing.mp4',
        browserFile: { name: 'missing.mp4', type: 'video/mp4' },
        destination: {
          kind: 'project',
          directory: 'media',
          copyMode: 'link',
        },
        ingestMode: 'link',
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceRejected',
        result: expect.objectContaining({
          ok: false,
          requestId: 'add-3b',
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              code: 'non-portable-path',
              message: expect.stringContaining('must be moved into the project'),
            }),
          ]),
        }),
      }),
    );
  });

  it('contracts workspace media paths without copying them', async () => {
    const handler = createHandler();
    const bytes = new TextEncoder().encode('workspace-video');
    fileContents.set('/workspace/project/shared/clip.mp4', bytes);

    await handler.handleMessage({
      type: 'project:addSource',
      request: {
        requestId: 'add-4',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: '/workspace/project/shared/clip.mp4',
        browserFile: { name: 'clip.mp4', type: 'video/mp4' },
        destination: {
          kind: 'project',
          directory: 'media',
          copyMode: 'link',
        },
        ingestMode: 'link',
      },
    });

    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sourceAdded',
        result: expect.objectContaining({
          ok: true,
          durablePath: 'shared/clip.mp4',
        }),
      }),
    );
    expect(fileContents.has('/workspace/project/media/clip.mp4')).toBe(false);
  });

  function createHandler(): MessageHandler {
    return new MessageHandler(
      webview as never,
      model as never,
      { globalStorageUri: { fsPath: '/tmp/neko' } } as never,
      null,
    );
  }
});

function createProject(): ProjectData {
  return {
    version: '2.0',
    name: 'Save test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [],
  };
}

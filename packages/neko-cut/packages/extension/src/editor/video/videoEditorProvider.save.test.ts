import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '@neko/shared';
import { requestWebviewProjectSnapshot } from '@neko/shared/vscode/extension';
import { VideoEditorProvider } from './videoEditorProvider';
import { VideoProjectDocument } from './videoProjectDocument';
import { saveCutProjectFile } from './cutProjectFilePersistence';

const executeCommandMock = vi.hoisted(() => vi.fn(async () => undefined));
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private readonly listeners: Array<(event: T) => void> = [];

    readonly event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };

    fire(event: T): void {
      for (const listener of [...this.listeners]) listener(event);
    }

    dispose(): void {
      this.listeners.length = 0;
    }
  }

  return {
    EndOfLine: { LF: 1 },
    EventEmitter,
    Position: class Position {
      constructor(
        readonly line: number,
        readonly character: number,
      ) {}
    },
    TreeItem: class TreeItem {
      constructor(
        readonly label: string,
        readonly collapsibleState?: unknown,
      ) {}
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    Uri: {
      file: (fsPath: string) => ({
        fsPath,
        toString: () => `file://${fsPath}`,
      }),
      parse: (value: string) => ({
        fsPath: value.replace(/^file:\/\//, ''),
        toString: () => value,
      }),
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
        fsPath: [base.fsPath, ...parts].join('/'),
        toString: () => `file://${[base.fsPath, ...parts].join('/')}`,
      }),
    },
    commands: { executeCommand: executeCommandMock },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace/project' } }],
      fs: {
        readFile: readFileMock,
        delete: vi.fn(async () => undefined),
      },
    },
  };
});

vi.mock('@neko/shared/vscode/extension', async () => {
  const actual = await vi.importActual<typeof import('@neko/shared/vscode/extension')>(
    '@neko/shared/vscode/extension',
  );
  return {
    ...actual,
    createHostContentAccessRuntime: vi.fn(() => ({
      localResourceAccess: {
        configureWebview: vi.fn(async () => undefined),
        createSyncProjector: vi.fn(),
      },
      contentAccess: {
        resolve: vi.fn(async () => ({ status: 'unsupported-source' })),
      },
      contentIngest: {
        ingest: vi.fn(async () => ({ status: 'unsupported-destination' })),
      },
      registerAccessProvider: vi.fn(),
      registerIngestProvider: vi.fn(),
      registerResourceCacheProvider: vi.fn(),
    })),
    requestWebviewProjectSnapshot: vi.fn(),
  };
});

vi.mock('./cutProjectFilePersistence', () => ({
  saveCutProjectFile: vi.fn(async (_uri: unknown, project: ProjectData) => ({
    ok: true,
    document: project,
    diagnostics: [],
  })),
  prepareCutProjectFileSave: vi.fn(async (_uri: unknown, project: ProjectData) => ({
    ok: true,
    document: project,
    content: `${JSON.stringify(project)}\n`,
    diagnostics: [],
  })),
}));

vi.mock('../../base', () => ({
  createServiceId: vi.fn((id: string) => id),
  getService: vi.fn(() => null),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('VideoEditorProvider custom document save', () => {
  beforeEach(() => {
    vi.mocked(requestWebviewProjectSnapshot).mockReset();
    vi.mocked(saveCutProjectFile).mockClear();
    executeCommandMock.mockClear();
    readFileMock.mockReset();
  });

  it('saves through ProjectFileStore from the live Webview snapshot', async () => {
    const provider = createProvider();
    const document = new VideoProjectDocument(
      createUri('/workspace/project/edit.nkv'),
      createProject(),
    );
    const snapshot = createProject({ name: 'Snapshot Project' });
    vi.mocked(requestWebviewProjectSnapshot).mockResolvedValue(snapshot);
    setActivePanel(provider, document.uri.toString(), {
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn(),
    });

    await provider.saveCustomDocument(document, {} as never);

    expect(requestWebviewProjectSnapshot).toHaveBeenCalledWith(expect.anything(), {
      formatId: 'nkv',
      saveReason: 'vscode-save',
    });
    expect(saveCutProjectFile).toHaveBeenCalledWith(document.uri, snapshot, 'vscode-save');
    expect(document.projectData.name).toBe('Snapshot Project');
  });

  it('does not echo saved content back to the webview after a VS Code save', async () => {
    const provider = createProvider();
    const document = new VideoProjectDocument(
      createUri('/workspace/project/edit.nkv'),
      createProject(),
    );
    const postMessage = vi.fn();
    vi.mocked(requestWebviewProjectSnapshot).mockResolvedValue(
      createProject({ name: 'Saved Without Echo' }),
    );
    setActivePanel(provider, document.uri.toString(), {
      postMessage,
      onDidReceiveMessage: vi.fn(),
    });

    await provider.saveCustomDocument(document, {} as never);

    expect(postMessage).toHaveBeenCalledWith({ type: 'saved' });
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'saved',
        content: expect.anything(),
      }),
    );
  });

  it('marks a custom document dirty with a content-change event only', () => {
    const provider = createProvider();
    const document = new VideoProjectDocument(
      createUri('/workspace/project/edit.nkv'),
      createProject(),
    );
    const dirtyEvents: unknown[] = [];
    provider.onDidChangeCustomDocument((event) => dirtyEvents.push(event));

    provider['markDocumentDirty'](document);

    expect(dirtyEvents).toHaveLength(1);
    expect(dirtyEvents[0]).toMatchObject({ document });
    expect(dirtyEvents[0]).not.toHaveProperty('undo');
    expect(dirtyEvents[0]).not.toHaveProperty('redo');
    expect(executeCommandMock).not.toHaveBeenCalled();
  });
});

function createProvider(): VideoEditorProvider {
  return new VideoEditorProvider({
    extensionUri: createUri('/workspace/neko-cut'),
    subscriptions: [],
  } as never);
}

function setActivePanel(
  provider: VideoEditorProvider,
  documentUri: string,
  webview: { postMessage: ReturnType<typeof vi.fn>; onDidReceiveMessage: ReturnType<typeof vi.fn> },
): void {
  const panels = provider['activeWebviewPanels'] as Map<string, { readonly webview: unknown }>;
  panels.set(documentUri, { webview });
}

function createUri(fsPath: string) {
  return {
    fsPath,
    toString: () => `file://${fsPath}`,
  };
}

function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Provider Save',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Main',
        type: 'media',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    ...overrides,
  };
}

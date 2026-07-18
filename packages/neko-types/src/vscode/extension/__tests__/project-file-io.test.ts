import { describe, expect, it, vi } from 'vitest';
import { createVSCodeProjectFileIoAdapter } from '../project-file-io';
import { formatProjectFileDiagnostics, ProjectFileSaveSession } from '../project-file-save-session';
import {
  createProjectFileDiagnostic,
  PROJECT_FILE_SNAPSHOT_REQUEST,
  type ProjectFileSaveResponse,
} from '../../../project-file-io';

describe('createVSCodeProjectFileIoAdapter', () => {
  it('wraps workspace.fs and creates path context', async () => {
    const storage = new Map<string, Uint8Array>();
    const vscodeApi = {
      Uri: {
        file: (fsPath: string) => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }),
      },
      workspace: {
        workspaceFolders: [
          {
            uri: { fsPath: '/workspace/project', scheme: 'file' },
            name: 'project',
            index: 0,
          },
        ],
        fs: {
          readFile: vi.fn(
            async (uri: { fsPath: string }) => storage.get(uri.fsPath) ?? new Uint8Array(),
          ),
          writeFile: vi.fn(async (uri: { fsPath: string }, content: Uint8Array) => {
            storage.set(uri.fsPath, content);
          }),
          delete: vi.fn(async (uri: { fsPath: string }) => {
            storage.delete(uri.fsPath);
          }),
          rename: vi.fn(async (from: { fsPath: string }, to: { fsPath: string }) => {
            const content = storage.get(from.fsPath);
            if (content) storage.set(to.fsPath, content);
            storage.delete(from.fsPath);
          }),
        },
      },
    };

    const adapter = createVSCodeProjectFileIoAdapter({
      vscodeApi: vscodeApi as never,
      pathVariables: new Map([['MEDIA', '/Volumes/media']]),
    });
    await adapter.fileOps.writeFile('/workspace/project/edit.nkv', new TextEncoder().encode('ok'));
    const read = await adapter.fileOps.readFile('/workspace/project/edit.nkv');
    const context = adapter.createWorkspaceMediaPathContext({
      documentUri: {
        fsPath: '/workspace/project/edit.nkv',
        scheme: 'file',
        toString: () => 'file:///workspace/project/edit.nkv',
      } as never,
    });

    expect(new TextDecoder().decode(read)).toBe('ok');
    expect(context.owningWorkspaceRoot).toBe('/workspace/project');
    expect(context.pathVariables?.get('MEDIA')).toBe('/Volumes/media');
    expect(context.pathVariables?.get('WORKSPACE')).toBe('/workspace/project');
  });
});

describe('ProjectFileSaveSession', () => {
  it('saves documents through the shared store with source policy context', async () => {
    const save = vi.fn(async (request: unknown): Promise<ProjectFileSaveResponse> => {
      const document = (request as { document: { title: string } }).document;
      return {
        ok: true,
        filePath: '/workspace/project/edit.nkc',
        document,
        diagnostics: [],
        written: true,
      };
    });
    const session = new ProjectFileSaveSession<{ title: string }>({
      formatId: 'nkc',
      store: { save } as never,
      createSourcePolicyOptions: (uri) => ({
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          documentDir: uri.fsPath.replace(/\/[^/]+$/, ''),
        },
      }),
    });

    const result = await session.save({
      targetUri: createUri('/workspace/project/edit.nkc'),
      document: { title: 'Canvas' },
      saveReason: 'vscode-save',
      defaultMessage: 'Failed to save NKC',
    });

    expect(result.written).toBe(true);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/workspace/project/edit.nkc',
        formatId: 'nkc',
        document: { title: 'Canvas' },
        saveReason: 'vscode-save',
        atomic: false,
        sourcePolicyOptions: expect.objectContaining({
          context: expect.objectContaining({ documentDir: '/workspace/project' }),
        }),
      }),
    );
  });

  it('writes project document saves in-place by default to avoid visible delete/add churn', async () => {
    const save = vi.fn(async (request: unknown): Promise<ProjectFileSaveResponse> => ({
      ok: true,
      filePath: '/workspace/project/edit.nkv',
      document: (request as { document: { title: string } }).document,
      diagnostics: [],
      written: true,
    }));
    const session = new ProjectFileSaveSession<{ title: string }>({
      formatId: 'nkv',
      store: { save } as never,
    });

    await session.save({
      targetUri: createUri('/workspace/project/edit.nkv'),
      document: { title: 'Cut' },
      saveReason: 'external-sync',
      defaultMessage: 'Failed to save NKV',
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        saveReason: 'external-sync',
        atomic: false,
      }),
    );
  });

  it('preserves add-source save reason in session diagnostics', async () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
    };
    const save = vi.fn(async (request: unknown): Promise<ProjectFileSaveResponse> => ({
      ok: true,
      filePath: '/workspace/project/edit.nkc',
      document: (request as { document: { title: string } }).document,
      diagnostics: [],
      written: true,
    }));
    const session = new ProjectFileSaveSession<{ title: string }>({
      formatId: 'nkc',
      store: { save } as never,
      logger,
    });

    await session.save({
      targetUri: createUri('/workspace/project/edit.nkc'),
      document: { title: 'Canvas asset add' },
      saveReason: 'add-source',
      defaultMessage: 'Failed to save NKC',
    });

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ saveReason: 'add-source' }));
    expect(logger.debug).toHaveBeenCalledWith(
      'projectFile.saveSession',
      expect.objectContaining({
        formatId: 'nkc',
        saveReason: 'add-source',
        written: true,
      }),
    );
  });

  it('allows callers to override the default atomic write policy', async () => {
    const save = vi.fn(async (request: unknown): Promise<ProjectFileSaveResponse> => ({
      ok: true,
      filePath: '/workspace/project/edit.nkv',
      document: (request as { document: { title: string } }).document,
      diagnostics: [],
      written: true,
    }));
    const session = new ProjectFileSaveSession<{ title: string }>({
      formatId: 'nkv',
      store: { save } as never,
    });

    await session.save({
      targetUri: createUri('/workspace/project/edit.nkv'),
      document: { title: 'Audio' },
      saveReason: 'vscode-save',
      atomic: true,
      defaultMessage: 'Failed to save NKV',
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        saveReason: 'vscode-save',
        atomic: true,
      }),
    );
  });

  it('waits for a Webview snapshot before saving', async () => {
    const save = vi.fn(async (request: unknown): Promise<ProjectFileSaveResponse> => {
      const document = (request as { document: { title: string } }).document;
      return {
        ok: true,
        filePath: '/workspace/project/edit.nkc',
        document,
        diagnostics: [],
        written: true,
      };
    });
    const webview = createSnapshotWebview({ title: 'Canvas' });
    const session = new ProjectFileSaveSession<{ title: string }>({
      formatId: 'nkc',
      store: { save } as never,
    });

    await session.saveFromWebviewSnapshot({
      webview,
      targetUri: createUri('/workspace/project/edit.nkc'),
      saveReason: 'vscode-save',
      defaultMessage: 'Failed to save NKC',
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        document: { title: 'Canvas' },
        saveReason: 'vscode-save',
      }),
    );
  });

  it('throws formatted diagnostics when the store blocks save', async () => {
    const save = vi.fn(async (): Promise<ProjectFileSaveResponse> => ({
      ok: false,
      filePath: '/workspace/project/edit.nkv',
      diagnostics: [
        createProjectFileDiagnostic({
          code: 'non-portable-path',
          message: 'Source clip.src is an absolute local path.',
        }),
      ],
      written: false,
    }));
    const session = new ProjectFileSaveSession<{ title: string }>({
      formatId: 'nkv',
      store: { save } as never,
    });

    await expect(
      session.save({
        targetUri: createUri('/workspace/project/edit.nkv'),
        document: { title: 'Cut' },
        defaultMessage: 'Failed to save NKV',
      }),
    ).rejects.toThrow('Failed to save NKV: Source clip.src is an absolute local path.');
  });

  it('formats empty diagnostics with the fallback message', () => {
    expect(formatProjectFileDiagnostics([], 'Failed to save')).toBe('Failed to save');
  });
});

function createUri(fsPath: string) {
  return { fsPath, scheme: 'file', toString: () => `file://${fsPath}` } as never;
}

function createSnapshotWebview<TDocument>(document: TDocument) {
  const listeners = new Set<(message: unknown) => void>();
  return {
    onDidReceiveMessage(listener: (message: unknown) => void) {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
    async postMessage(message: unknown) {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === PROJECT_FILE_SNAPSHOT_REQUEST
      ) {
        const requestId = (message as { requestId?: string }).requestId;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              type: 'projectFile:snapshot',
              requestId,
              ok: true,
              document,
            });
          }
        });
      }
      return true;
    },
  };
}

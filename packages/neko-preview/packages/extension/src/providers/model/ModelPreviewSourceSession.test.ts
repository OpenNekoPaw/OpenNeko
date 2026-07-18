import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalResourceAccessService } from '@neko/shared/vscode/extension';
import type { ModelSourceFileSystem } from './modelSourceInspection';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      scheme: 'file',
      fsPath,
      path: fsPath,
      toString: () => `file://${fsPath}`,
    }),
    joinPath: (base: { fsPath: string }, ...segments: string[]) => {
      const fsPath = path.join(base.fsPath, ...segments);
      return { scheme: 'file', fsPath, path: fsPath, toString: () => `file://${fsPath}` };
    },
  },
}));

import { ModelPreviewSourceSession } from './ModelPreviewSourceSession';

const workspace = '/workspace/project';
const sourcePath = '/workspace/project/model/scene.gltf';
const bufferPath = '/workspace/project/model/scene.bin';

describe('ModelPreviewSourceSession', () => {
  let webview: {
    options: Record<string, unknown>;
    asWebviewUri: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    webview = {
      options: {},
      asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
        toString: () => `webview:${uri.fsPath}`,
      })),
    };
  });

  it('authorizes and projects only the exact enumerated files', async () => {
    const session = await ModelPreviewSourceSession.open({
      sessionId: 'session-1',
      sourcePath,
      workspaceRoot: workspace,
      authorizedRoots: [workspace],
      extensionUri: uri('/extension'),
      webview: webview as never,
      authorization: authorization(true),
      fileSystem: memoryFileSystem({
        [sourcePath]: json({ asset: { version: '2.0' }, buffers: [{ uri: 'scene.bin' }] }),
        [bufferPath]: bytes('buffer'),
      }),
    });

    expect(session.descriptor.entryUri).toBe(`webview:${sourcePath}`);
    expect(session.descriptor.uriMap).toEqual({
      'scene.gltf': `webview:${sourcePath}`,
      'scene.bin': `webview:${bufferPath}`,
    });
    expect(webview.options.localResourceRoots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fsPath: sourcePath }),
        expect.objectContaining({ fsPath: bufferPath }),
      ]),
    );
    session.assertLive('session-1', session.descriptor.sourceFingerprint);
  });

  it('rejects unauthorized, stale, and disposed sessions visibly', async () => {
    await expect(
      ModelPreviewSourceSession.open({
        sessionId: 'session-1',
        sourcePath,
        authorizedRoots: [workspace],
        extensionUri: uri('/extension'),
        webview: webview as never,
        authorization: authorization(false),
        fileSystem: memoryFileSystem({ [sourcePath]: json({ asset: { version: '2.0' } }) }),
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'source-unauthorized' } });

    const session = await ModelPreviewSourceSession.open({
      sessionId: 'session-1',
      sourcePath,
      authorizedRoots: [workspace],
      extensionUri: uri('/extension'),
      webview: webview as never,
      authorization: authorization(true),
      fileSystem: memoryFileSystem({ [sourcePath]: json({ asset: { version: '2.0' } }) }),
    });
    expect(() =>
      session.assertLive('other-session', session.descriptor.sourceFingerprint),
    ).toThrow();
    session.dispose();
    session.dispose();
    expect(webview.options.localResourceRoots).toEqual([]);
    expect(() => session.assertLive('session-1', session.descriptor.sourceFingerprint)).toThrow();
  });

  it('cancels inspection and revokes projections when opening is aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      ModelPreviewSourceSession.open({
        sessionId: 'session-1',
        sourcePath,
        authorizedRoots: [workspace],
        extensionUri: uri('/extension'),
        webview: webview as never,
        authorization: authorization(true),
        fileSystem: memoryFileSystem({ [sourcePath]: json({ asset: { version: '2.0' } }) }),
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
    expect(webview.options.localResourceRoots).toEqual([]);
  });
});

function authorization(allowed: boolean): LocalResourceAccessService {
  return {
    isAuthorizedPath: vi.fn(async () => allowed),
  } as unknown as LocalResourceAccessService;
}

function memoryFileSystem(files: Readonly<Record<string, Uint8Array>>): ModelSourceFileSystem {
  return {
    async stat(filePath, signal) {
      signal?.throwIfAborted();
      const content = files[filePath];
      if (!content) throw new Error('missing');
      return { size: content.byteLength, mtimeMs: 42, isFile: true };
    },
    async readFile(filePath, signal) {
      signal?.throwIfAborted();
      const content = files[filePath];
      if (!content) throw new Error('missing');
      return content;
    },
  };
}

function uri(fsPath: string) {
  return { scheme: 'file', fsPath, path: fsPath, toString: () => `file://${fsPath}` } as never;
}

function json(value: unknown): Uint8Array {
  return bytes(JSON.stringify(value));
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

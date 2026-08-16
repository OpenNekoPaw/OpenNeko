import { describe, expect, it, vi } from 'vitest';
import { createEmptyCanvasData, saveNkc } from '@neko/canvas-domain';
import { createCanvasWorkspaceIndexNodeAdapter } from './canvas-workspace-index-node-adapter';
import type { HostFileStat, HostDirEntry } from '@neko/host/ports';

describe('Canvas workspace index node adapter', () => {
  it('lists exact .nkc identities and skips the canonical Board and symlinks', async () => {
    const files = new Map<string, string>();
    files.set('neko/boards/a.nkc', saveNkc(createEmptyCanvasData('A')));
    const adapter = createCanvasWorkspaceIndexNodeAdapter({
      workspaceRoot: '/workspace',
      host: {
        files: {
          readDirectory: vi.fn(async (dir) => {
            if (dir === '/workspace') {
              return [
                { name: 'neko', type: 'directory' },
                { name: 'escape.nkc', type: 'symlink' },
              ] satisfies HostDirEntry[];
            }
            if (dir === '/workspace/neko') {
              return [{ name: 'boards', type: 'directory' }] satisfies HostDirEntry[];
            }
            if (dir === '/workspace/neko/boards') {
              return [
                { name: 'a.nkc', type: 'file' },
                { name: 'workspace.nkc', type: 'file' },
                { name: 'b.nkc', type: 'file' },
              ] satisfies HostDirEntry[];
            }
            return [];
          }),
          readText: vi.fn(async (filePath) => {
            const value = files.get(filePath.replace('/workspace/', ''));
            if (value === undefined) throw new Error('missing');
            return value;
          }),
          readBytes: vi.fn(async () => new Uint8Array()),
          writeText: vi.fn(async () => undefined),
          writeBytes: vi.fn(async () => undefined),
          rename: vi.fn(async () => undefined),
          createDirectory: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
          stat: vi.fn(async (filePath): Promise<HostFileStat> => {
            const key = filePath.replace('/workspace/', '');
            if (files.has(key)) return { type: 'file' };
            if (key === 'neko' || key === 'neko/boards') return { type: 'directory' };
            return { type: 'unknown' };
          }),
        },
      },
    });

    const identities = await adapter.listExactCanvasDocuments('workspace-1');
    expect(identities).toEqual(['neko/boards/a.nkc', 'neko/boards/b.nkc']);

    await expect(
      adapter.readExactCanvasSummary('workspace-1', 'neko/boards/a.nkc'),
    ).resolves.toEqual({
      canvasId: 'neko/boards/a.nkc',
      name: 'A',
      nodeTypeSummary: {},
    });
  });

  it('rejects unsafe identities and escaping paths', async () => {
    const adapter = createCanvasWorkspaceIndexNodeAdapter({
      workspaceRoot: '/workspace',
      host: {
        files: {
          readDirectory: vi.fn(async () => []),
          readText: vi.fn(async () => saveNkc(createEmptyCanvasData('A'))),
          readBytes: vi.fn(async () => new Uint8Array()),
          writeText: vi.fn(async () => undefined),
          writeBytes: vi.fn(async () => undefined),
          rename: vi.fn(async () => undefined),
          createDirectory: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
          stat: vi.fn(async (): Promise<HostFileStat> => ({ type: 'file' })),
        },
      },
    });

    await expect(adapter.readExactCanvasSummary('workspace-1', '../outside.nkc')).rejects.toThrow(
      'must not escape',
    );
    await expect(adapter.readExactCanvasSummary('workspace-1', '/absolute.nkc')).rejects.toThrow(
      'non-empty workspace-relative path',
    );
  });
});

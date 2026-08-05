import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostFileSystemPort } from '@neko/host/ports';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import { createResourceBrowserNodeProjectionSource } from './resource-browser-node-source';

describe('Resource Browser Workspace File mutations', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  }, 30_000);

  it('imports large files in Node without transporting bytes through Host file buffers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-import-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    const incomingPath = path.join(root, 'large-video.bin');
    await mkdir(workspacePath);
    const bytes = Buffer.alloc(3 * 1024 * 1024, 7);
    await writeFile(incomingPath, bytes);
    const readBytes = vi.fn(async () => {
      throw new Error('Resource Browser import must not buffer source bytes through Host.');
    });
    const writeBytes = vi.fn(async () => {
      throw new Error('Resource Browser import must not buffer destination bytes through Host.');
    });
    const composition = createComposition(workspacePath, createFilePort(readBytes, writeBytes), {
      selectWorkspaceFiles: async () => [incomingPath],
    });

    await expect(composition.interactions.importFiles({ identity })).resolves.toBe('imported');

    expect(readBytes).not.toHaveBeenCalled();
    expect(writeBytes).not.toHaveBeenCalled();
    expect(await readFile(path.join(workspacePath, 'large-video.bin'))).toEqual(bytes);
    expect((await readdir(workspacePath)).some((name) => name.startsWith('.neko-import-'))).toBe(
      false,
    );
  }, 30_000);

  it('creates contained directories, refuses overwrite, and delegates deletion to OS Trash', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-mutation-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath);
    const trashWorkspaceItem = vi.fn(async (_absolutePath: string) => undefined);
    const composition = createComposition(workspacePath, createFilePort(), { trashWorkspaceItem });

    await composition.interactions.createDirectory({ identity, name: 'References' });
    await expect(stat(path.join(workspacePath, 'References'))).resolves.toMatchObject({});
    await expect(
      composition.interactions.createDirectory({ identity, name: 'References' }),
    ).rejects.toThrow('already exists');
    const item = {
      resourceId: 'content:notes.txt',
      facet: 'files' as const,
      kind: 'file' as const,
      label: 'notes.txt',
      role: 'content' as const,
      depth: 0,
      locator: { kind: 'workspace-file' as const, path: 'notes.txt' },
      capabilities: [],
    };
    await writeFile(path.join(workspacePath, 'notes.txt'), 'notes', 'utf8');

    await composition.interactions.trashContent({ identity, item });

    expect(trashWorkspaceItem).toHaveBeenCalledWith(
      await realpath(path.join(workspacePath, 'notes.txt')),
    );
  });

  it('rejects non-portable imported file names before publishing Workspace content', async () => {
    if (process.platform === 'win32') return;
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-portable-name-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    const incomingPath = path.join(root, 'not\\portable.txt');
    await mkdir(workspacePath);
    await writeFile(incomingPath, 'content', 'utf8');
    const composition = createComposition(workspacePath, createFilePort(), {
      selectWorkspaceFiles: async () => [incomingPath],
    });

    await expect(composition.interactions.importFiles({ identity })).rejects.toThrow(
      'visible portable file name',
    );
    await expect(readdir(workspacePath)).resolves.toEqual([]);
  });
});

function createComposition(
  workspacePath: string,
  files: HostFileSystemPort,
  overrides: {
    readonly selectWorkspaceFiles?: () => Promise<readonly string[] | undefined>;
    readonly trashWorkspaceItem?: (absolutePath: string) => Promise<void>;
  } = {},
) {
  return createResourceBrowserNodeProjectionSource({
    globalAssetRoot: path.join(path.dirname(workspacePath), 'assets'),
    globalMediaLibraryRoot: path.join(path.dirname(workspacePath), 'media-libraries'),
    workspace: {
      workspaceId: identity.workspaceId,
      workspacePath,
      displayName: 'Workspace',
      locator: { kind: 'relative', value: 'workspace' },
    },
    host: {
      files,
      external: { openExternal: async () => undefined },
    },
    openPreview: async () => undefined,
    openCut: async () => undefined,
    selectSource: async () => undefined,
    selectWorkspaceFiles: overrides.selectWorkspaceFiles ?? (async () => undefined),
    trashWorkspaceItem: overrides.trashWorkspaceItem ?? (async () => undefined),
    selectGlobalLibrary: async () => undefined,
    mutateGlobalMediaLibraries: (operation) => operation(),
    createThumbnail: async () => 'data:image/png;base64,AA==',
    addToCanvas: async () => undefined,
    addToCut: async () => undefined,
    manageEntity: async () => undefined,
  });
}

function createFilePort(
  readBytes: HostFileSystemPort['readBytes'] = async (filePath) => readFile(filePath),
  writeBytes: HostFileSystemPort['writeBytes'] = async (filePath, content) =>
    writeFile(filePath, content),
): HostFileSystemPort {
  return {
    readText: (filePath) => readFile(filePath, 'utf8'),
    readBytes,
    writeText: (filePath, content) => writeFile(filePath, content, 'utf8'),
    writeBytes,
    rename: async () => undefined,
    readDirectory: async () => [],
    stat: async (filePath) => {
      const value = await stat(filePath);
      return { type: value.isDirectory() ? 'directory' : 'file', sizeBytes: value.size };
    },
    createDirectory: async (directoryPath) => {
      await mkdir(directoryPath, { recursive: true });
    },
    delete: async () => undefined,
  };
}

const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'endpoint-1',
};

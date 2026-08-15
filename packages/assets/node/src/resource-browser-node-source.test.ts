import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostFileSystemPort } from '@neko/host/ports';
import type { ResourceBrowserIdentity } from '@neko/assets-domain/resource-browser/contract';
import { createResourceBrowserNodeProjectionSource } from './resource-browser-node-source';
import { loadNkc } from '@neko/canvas-domain/nkc';
import { parseOtio } from '@neko/cut-domain';

describe('Resource Browser Workspace File mutations', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  }, 30_000);

  it('creates an empty ordinary file exclusively through the Content owner', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-create-file-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath);
    const composition = createComposition(workspacePath, createFilePort());

    await expect(
      composition.interactions.createFile({ identity, name: 'notes.md' }),
    ).resolves.toBeUndefined();

    expect(await readFile(path.join(workspacePath, 'notes.md'))).toEqual(Buffer.alloc(0));
    await expect(
      composition.interactions.createFile({ identity, name: 'notes.md' }),
    ).rejects.toThrow('content-conflict');
    await expect(
      composition.interactions.createFile({ identity, name: 'board.nkc' }),
    ).rejects.toThrow('requires New Canvas');
    expect(await readdir(workspacePath)).toEqual(['notes.md']);
  });

  it('creates under an explicitly selected Workspace directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-create-nested-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(path.join(workspacePath, 'references'), { recursive: true });
    const composition = createComposition(workspacePath, createFilePort());
    const parent = {
      resourceId: 'content:references',
      source: 'files' as const,
      kind: 'directory' as const,
      label: 'references',
      role: 'directory' as const,
      depth: 0,
      locator: { kind: 'workspace-file' as const, path: 'references' },
      capabilities: [],
    };

    await composition.interactions.createFile({ identity, parent, name: 'sources.txt' });

    expect(await readFile(path.join(workspacePath, 'references', 'sources.txt'))).toEqual(
      Buffer.alloc(0),
    );
  });

  it('rejects a stale selected directory without retrying at Workspace root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-create-stale-parent-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(path.join(workspacePath, 'references'), { recursive: true });
    const composition = createComposition(workspacePath, createFilePort());
    const parent = {
      resourceId: 'content:references',
      source: 'files' as const,
      kind: 'directory' as const,
      label: 'references',
      role: 'directory' as const,
      depth: 0,
      locator: { kind: 'workspace-file' as const, path: 'references' },
      capabilities: [],
    };
    await rm(path.join(workspacePath, 'references'), { recursive: true });

    await expect(
      composition.interactions.createFile({ identity, parent, name: 'sources.txt' }),
    ).rejects.toThrow();

    expect(await readdir(workspacePath)).toEqual([]);
  });

  it('publishes Canvas and Cut documents only through their canonical owners', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-create-documents-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath);
    const openCreativeDocument = vi.fn(
      async (input: { readonly absolutePath: string; readonly kind: 'canvas' | 'cut' }) => {
        const bytes = await readFile(input.absolutePath);
        if (input.kind === 'canvas') {
          expect(loadNkc(bytes.toString('utf8')).validation.valid).toBe(true);
        } else {
          expect(parseOtio(bytes).ok).toBe(true);
        }
      },
    );
    const composition = createComposition(workspacePath, createFilePort(), {
      openCreativeDocument,
    });

    await expect(
      composition.interactions.createCreativeDocument({
        identity,
        kind: 'canvas',
        name: 'Storyboard',
      }),
    ).resolves.toEqual({ status: 'opened' });
    await expect(
      composition.interactions.createCreativeDocument({
        identity,
        kind: 'cut',
        name: 'Rough Cut.otio',
      }),
    ).resolves.toEqual({ status: 'opened' });

    const canvas = loadNkc(await readFile(path.join(workspacePath, 'Storyboard.nkc'), 'utf8'));
    const cut = parseOtio(await readFile(path.join(workspacePath, 'Rough Cut.otio')));
    expect(canvas.validation.valid).toBe(true);
    expect(canvas.data.name).toBe('Storyboard');
    expect(cut.ok).toBe(true);
    if (!cut.ok) throw new Error('Expected valid Cut document.');
    expect(cut.document.name).toBe('Rough Cut');
    expect(openCreativeDocument.mock.calls.map(([input]) => input.kind)).toEqual(['canvas', 'cut']);
  });

  it('keeps a published creative document and reports a local diagnostic when open fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-create-open-failure-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath);
    const composition = createComposition(workspacePath, createFilePort(), {
      openCreativeDocument: async () => {
        throw new Error('editor unavailable');
      },
    });

    await expect(
      composition.interactions.createCreativeDocument({
        identity,
        kind: 'canvas',
        name: 'Storyboard',
      }),
    ).resolves.toMatchObject({
      status: 'created',
      diagnostic: {
        code: 'creative-document-open-failed',
        message: expect.stringContaining('editor unavailable'),
      },
    });
    expect(
      loadNkc(await readFile(path.join(workspacePath, 'Storyboard.nkc'), 'utf8')).validation.valid,
    ).toBe(true);
  });

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
    ).rejects.toThrow('content-conflict');
    const item = {
      resourceId: 'content:notes.txt',
      source: 'files' as const,
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

  it('rejects generic mutations of package-owned project facts and local state', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-owned-storage-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(path.join(workspacePath, 'neko'), { recursive: true });
    await mkdir(path.join(workspacePath, '.neko'), { recursive: true });
    await writeFile(path.join(workspacePath, 'neko', 'project.json'), '{}', 'utf8');
    await writeFile(path.join(workspacePath, '.neko', 'local.json'), '{}', 'utf8');
    const trashWorkspaceItem = vi.fn(async (_absolutePath: string) => undefined);
    const composition = createComposition(workspacePath, createFilePort(), { trashWorkspaceItem });
    const factsDirectory = {
      resourceId: 'content:neko',
      source: 'files' as const,
      kind: 'directory' as const,
      label: 'neko',
      role: 'directory' as const,
      depth: 0,
      locator: { kind: 'workspace-file' as const, path: 'neko' },
      capabilities: [],
    };
    const factsFile = {
      resourceId: 'content:neko/project.json',
      source: 'files' as const,
      kind: 'file' as const,
      label: 'project.json',
      role: 'content' as const,
      depth: 0,
      locator: { kind: 'workspace-file' as const, path: 'neko/project.json' },
      capabilities: [],
    };
    const localStateFile = {
      resourceId: 'content:.neko/local.json',
      source: 'files' as const,
      kind: 'file' as const,
      label: 'local.json',
      role: 'content' as const,
      depth: 0,
      locator: { kind: 'workspace-file' as const, path: '.neko/local.json' },
      capabilities: [],
    };

    await expect(
      composition.interactions.createFile({
        identity,
        parent: factsDirectory,
        name: 'bypass.json',
      }),
    ).rejects.toThrow('project-facts');
    await expect(
      composition.interactions.trashContent({ identity, item: factsFile }),
    ).rejects.toThrow('project-facts');
    await expect(
      composition.interactions.trashContent({ identity, item: localStateFile }),
    ).rejects.toThrow('project-local-state');

    expect(trashWorkspaceItem).not.toHaveBeenCalled();
    await expect(stat(path.join(workspacePath, 'neko', 'bypass.json'))).rejects.toThrow();
    await expect(readFile(path.join(workspacePath, 'neko', 'project.json'), 'utf8')).resolves.toBe(
      '{}',
    );
    await expect(readFile(path.join(workspacePath, '.neko', 'local.json'), 'utf8')).resolves.toBe(
      '{}',
    );
  });

  it('rejects non-portable entry names before publishing Workspace content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-resource-portable-name-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    await mkdir(workspacePath);
    const composition = createComposition(workspacePath, createFilePort());

    await expect(
      composition.interactions.createFile({ identity, name: 'not\\portable.txt' }),
    ).rejects.toThrow('portable path segment');
    await expect(readdir(workspacePath)).resolves.toEqual([]);
  });
});

function createComposition(
  workspacePath: string,
  files: HostFileSystemPort,
  overrides: {
    readonly trashWorkspaceItem?: (absolutePath: string) => Promise<void>;
    readonly openCreativeDocument?: Parameters<
      typeof createResourceBrowserNodeProjectionSource
    >[0]['openCreativeDocument'];
  } = {},
) {
  return createResourceBrowserNodeProjectionSource({
    projectId: identity.projectId,
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
    openCreativeDocument: overrides.openCreativeDocument ?? (async () => undefined),
    openTextEditor: async () => undefined,
    selectSource: async () => undefined,
    selectWorkspaceFiles: async () => undefined,
    trashWorkspaceItem: overrides.trashWorkspaceItem ?? (async () => undefined),
    selectGlobalLibrary: async () => undefined,
    mutateGlobalMediaLibraries: (operation) => operation(),
    createThumbnail: async () => 'data:image/png;base64,AA==',
    addToCanvas: async () => undefined,
    addToCut: async () => undefined,
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

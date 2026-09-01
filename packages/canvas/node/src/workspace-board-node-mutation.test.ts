import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CANVAS_DEFAULT_DOCUMENT_PATH,
  createEmptyCanvasData,
  loadNkc,
  saveNkc,
} from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';
import { WorkspaceBoardNodeMutation } from './workspace-board-node-mutation';

describe('WorkspaceBoardNodeMutation', () => {
  let root = '';
  let externalRoot = '';

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-workspace-board-'));
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(root, { recursive: true, force: true }),
      externalRoot ? fs.rm(externalRoot, { recursive: true, force: true }) : Promise.resolve(),
    ]);
    externalRoot = '';
  });

  it('loads a missing canonical Board as a fresh unsaved document', async () => {
    const mutation = createMutation(root);
    const documentUri = boardUri(root);

    await expect(
      mutation.loadLatest({ documentUri, createIfMissing: true }),
    ).resolves.toMatchObject({
      documentUri,
      exists: false,
      canvasData: { name: `${path.basename(root)} Board` },
    });
  });

  it('atomically saves and reloads the canonical Board', async () => {
    const mutation = createMutation(root);
    const documentUri = boardUri(root);
    const canvasData = createEmptyCanvasData('Agent Results');

    await mutation.saveAtomic({ documentUri, canvasData });

    await expect(mutation.loadLatest({ documentUri, createIfMissing: false })).resolves.toEqual({
      documentUri,
      canvasData,
      exists: true,
    });
  });

  it('rejects an invalid existing Board without overwriting it', async () => {
    const documentPath = boardPath(root);
    await fs.mkdir(path.dirname(documentPath), { recursive: true });
    await fs.writeFile(documentPath, '{invalid', 'utf8');
    const mutation = createMutation(root);

    await expect(
      mutation.loadLatest({ documentUri: boardUri(root), createIfMissing: true }),
    ).rejects.toThrow(/invalid and was not modified/u);
    await expect(fs.readFile(documentPath, 'utf8')).resolves.toBe('{invalid');
  });

  it('accepts an authorized in-workspace exact .nkc document', async () => {
    const mutation = createMutation(root);
    const exactPath = path.join(root, 'neko', 'boards', 'story.nkc');
    const canvasData = createEmptyCanvasData('Story');
    await fs.mkdir(path.dirname(exactPath), { recursive: true });
    await fs.writeFile(exactPath, saveNkc(canvasData), 'utf8');

    await expect(
      mutation.loadLatest({
        documentUri: pathToFileURL(exactPath).href,
        createIfMissing: false,
      }),
    ).resolves.toEqual({
      documentUri: pathToFileURL(exactPath).href,
      canvasData,
      exists: true,
    });
  });

  it('rejects a document URI outside the authorized Workspace', async () => {
    const mutation = createMutation(root);

    await expect(
      mutation.loadLatest({
        documentUri: pathToFileURL(path.join(root, '..', 'outside.nkc')).href,
        createIfMissing: true,
      }),
    ).rejects.toThrow(/escapes the authorized Workspace/u);
  });

  it('loads a Board through a directory symlink but keeps the linked directory read-only', async () => {
    externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-workspace-board-external-'));
    const externalDocumentPath = boardPath(externalRoot);
    const original = createEmptyCanvasData('Linked directory');
    await fs.mkdir(path.dirname(externalDocumentPath), { recursive: true });
    await fs.writeFile(externalDocumentPath, saveNkc(original), 'utf8');
    await fs.symlink(path.join(externalRoot, 'neko'), path.join(root, 'neko'), 'dir');
    const mutation = createMutation(root);

    await expect(
      mutation.loadLatest({ documentUri: boardUri(root), createIfMissing: false }),
    ).resolves.toMatchObject({ canvasData: original, exists: true });
    await expect(
      mutation.saveAtomic({
        documentUri: boardUri(root),
        canvasData: createEmptyCanvasData('Replacement'),
      }),
    ).rejects.toThrow('symbolic-link targets are read-only');
    expect(loadNkc(await fs.readFile(externalDocumentPath, 'utf8')).data).toEqual(original);
  });

  it('loads a Board through a file symlink but keeps the linked file read-only', async () => {
    externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-workspace-board-external-'));
    const externalDocumentPath = path.join(externalRoot, 'workspace.nkc');
    const documentPath = boardPath(root);
    const original = createEmptyCanvasData('Linked file');
    await fs.mkdir(path.dirname(documentPath), { recursive: true });
    await fs.writeFile(externalDocumentPath, saveNkc(original), 'utf8');
    await fs.symlink(externalDocumentPath, documentPath, 'file');
    const mutation = createMutation(root);

    await expect(
      mutation.loadLatest({ documentUri: boardUri(root), createIfMissing: false }),
    ).resolves.toMatchObject({ canvasData: original, exists: true });
    await expect(
      mutation.saveAtomic({
        documentUri: boardUri(root),
        canvasData: createEmptyCanvasData('Replacement'),
      }),
    ).rejects.toThrow('symbolic-link targets are read-only');
    expect(loadNkc(await fs.readFile(externalDocumentPath, 'utf8')).data).toEqual(original);
  });

  it('does not rename a temporary document after writer ownership becomes stale', async () => {
    const documentPath = boardPath(root);
    await fs.mkdir(path.dirname(documentPath), { recursive: true });
    const original = createEmptyCanvasData('Original');
    await fs.writeFile(documentPath, saveNkc(original), 'utf8');
    const mutation = createMutation(root);
    let assertions = 0;

    await expect(
      mutation.saveAtomic({
        documentUri: boardUri(root),
        canvasData: createEmptyCanvasData('Replacement'),
        assertWriter: async () => {
          assertions += 1;
          if (assertions === 2) throw new Error('stale-writer');
        },
      }),
    ).rejects.toThrow('stale-writer');

    expect(loadNkc(await fs.readFile(documentPath, 'utf8')).data).toEqual(original);
    expect(
      (await fs.readdir(path.dirname(documentPath))).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });
});

function createMutation(workspacePath: string): WorkspaceBoardNodeMutation {
  return new WorkspaceBoardNodeMutation({
    workspace: {
      workspaceId: 'workspace-1',
      workspacePath,
      displayName: path.basename(workspacePath),
      locator: { kind: 'variable', value: '${HOME}/workspace' },
    },
    host: { files: createFilePort() },
    createIdentity: () => 'temporary',
  });
}

function boardPath(workspacePath: string): string {
  return path.join(workspacePath, ...CANVAS_DEFAULT_DOCUMENT_PATH.split('/'));
}

function boardUri(workspacePath: string): string {
  return pathToFileURL(boardPath(workspacePath)).href;
}

function createFilePort(): Pick<NekoHostPorts, 'files'>['files'] {
  return {
    readText: (filePath) => fs.readFile(filePath, 'utf8'),
    readBytes: (filePath) => fs.readFile(filePath),
    writeText: (filePath, content) => fs.writeFile(filePath, content, 'utf8'),
    writeBytes: (filePath, content) => fs.writeFile(filePath, content),
    rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
    readDirectory: async (directoryPath) =>
      (await fs.readdir(directoryPath, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'unknown',
      })),
    stat: async (filePath) => {
      const stat = await fs.stat(filePath);
      return {
        type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'unknown',
        sizeBytes: stat.size,
        modifiedAtMs: stat.mtimeMs,
        createdAtMs: stat.birthtimeMs,
      };
    },
    createDirectory: (directoryPath) =>
      fs.mkdir(directoryPath, { recursive: true }).then(() => undefined),
    delete: (targetPath, options) =>
      fs.rm(targetPath, {
        recursive: options?.recursive ?? false,
        force: options?.idempotent ?? false,
      }),
  };
}

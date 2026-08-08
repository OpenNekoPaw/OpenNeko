import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HostFileSystemPort } from '@neko/host/ports';
import { searchWorkspaceLinkedMediaLibraryContentLocators } from './resource-browser-node-source';

describe('Workspace Media Library mention search', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('returns portable linked media locators without following nested links', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-media-mention-'));
    roots.push(root);
    const workspacePath = path.join(root, 'workspace');
    const libraryTarget = path.join(root, 'library');
    const outsideTarget = path.join(root, 'outside');
    await Promise.all([
      mkdir(path.join(workspacePath, 'neko', 'assets'), { recursive: true }),
      mkdir(path.join(libraryTarget, 'shots'), { recursive: true }),
      mkdir(outsideTarget, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(libraryTarget, 'shots', 'hero.png'), 'image'),
      writeFile(path.join(libraryTarget, 'notes.txt'), 'not media'),
      writeFile(path.join(outsideTarget, 'secret.png'), 'secret'),
    ]);
    await symlink(outsideTarget, path.join(libraryTarget, 'outside'));
    await symlink(libraryTarget, path.join(workspacePath, 'neko', 'assets', 'Reference'));

    const locators = await searchWorkspaceLinkedMediaLibraryContentLocators({
      workspace: {
        workspaceId: 'workspace-1',
        workspacePath,
        displayName: 'Workspace',
        locator: { kind: 'relative', value: 'workspace' },
      },
      files: createNodeFilePort(),
      query: '',
      limit: 30,
    });

    expect(locators).toEqual([
      { kind: 'workspace-file', path: 'neko/assets/Reference/shots/hero.png' },
    ]);
    expect(JSON.stringify(locators)).not.toContain(libraryTarget);
    expect(JSON.stringify(locators)).not.toContain('secret.png');
  });
});

function createNodeFilePort(): HostFileSystemPort {
  return {
    readText: (filePath) => readFile(filePath, 'utf8'),
    readBytes: (filePath) => readFile(filePath),
    writeText: (filePath, content) => writeFile(filePath, content, 'utf8'),
    writeBytes: (filePath, content) => writeFile(filePath, content),
    rename: async () => undefined,
    readDirectory: async (directoryPath) =>
      (await readdir(directoryPath, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        type: entry.isSymbolicLink()
          ? ('symlink' as const)
          : entry.isDirectory()
            ? ('directory' as const)
            : entry.isFile()
              ? ('file' as const)
              : ('unknown' as const),
      })),
    stat: async (filePath) => {
      const value = await stat(filePath);
      return {
        type: value.isDirectory() ? ('directory' as const) : ('file' as const),
        sizeBytes: value.size,
        modifiedAtMs: value.mtimeMs,
      };
    },
    createDirectory: async (directoryPath) => {
      await mkdir(directoryPath, { recursive: true });
    },
    delete: async () => undefined,
  };
}

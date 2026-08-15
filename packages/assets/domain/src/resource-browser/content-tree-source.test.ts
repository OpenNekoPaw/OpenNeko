import { describe, expect, it, vi } from 'vitest';
import {
  readResourceBrowserContentChildren,
  searchResourceBrowserContentTree,
} from './content-tree-source';

describe('Resource Browser content tree source', () => {
  it('excludes dot-prefixed files and directories before search or metadata projection', async () => {
    const stat = vi.fn(async () => ({ sizeBytes: 4, modifiedAtMs: 20 }));
    const readDirectory = vi.fn(async (directory: string) => {
      if (directory === '/workspace') {
        return [
          { name: '.DS_Store', type: 'file' as const },
          { name: '.cache', type: 'directory' as const },
          { name: 'Media', type: 'directory' as const },
          { name: 'poster.png', type: 'file' as const },
        ];
      }
      if (directory === '/workspace/.cache') {
        return [{ name: 'hidden.png', type: 'file' as const }];
      }
      if (directory === '/workspace/Media') {
        return [{ name: 'shot.mp4', type: 'file' as const }];
      }
      return [];
    });

    const entries = await searchResourceBrowserContentTree({
      absoluteRoot: '/workspace',
      locatorPrefix: '',
      query: '',
      limit: 20,
      rootDepth: -1,
      excludedDirectoryNames: new Set(),
      files: { readDirectory, stat },
      joinAbsolutePath: (directory, childName) => `${directory}/${childName}`,
      relativePath: (_root, target) => target.replace('/workspace/', ''),
      classify: () => ({
        include: true,
        mediaType: 'image',
        capabilities: ['read'],
      }),
    });

    expect(entries.map((entry) => entry.label)).toEqual(['Media', 'poster.png', 'shot.mp4']);
    expect(readDirectory).not.toHaveBeenCalledWith('/workspace/.cache');
    expect(stat).toHaveBeenCalledTimes(2);
    expect(stat).not.toHaveBeenCalledWith('/workspace/.DS_Store');
  });

  it('excludes dot-prefixed children from immediate directory browsing', async () => {
    const entries = await readResourceBrowserContentChildren({
      absoluteRoot: '/workspace',
      absoluteDirectory: '/workspace',
      locatorPrefix: '',
      limit: 20,
      rootDepth: -1,
      excludedDirectoryNames: new Set(),
      files: {
        readDirectory: vi.fn(async () => [
          { name: '.hidden.png', type: 'file' as const },
          { name: '.private', type: 'directory' as const },
          { name: 'visible.png', type: 'file' as const },
        ]),
        stat: vi.fn(async () => ({ sizeBytes: 4, modifiedAtMs: 20 })),
      },
      joinAbsolutePath: (directory, childName) => `${directory}/${childName}`,
      relativePath: (_root, target) => target.replace('/workspace/', ''),
      classify: () => ({
        include: true,
        mediaType: 'image',
        capabilities: ['read'],
      }),
    });

    expect(entries.map((entry) => entry.label)).toEqual(['visible.png']);
  });

  it('does not inspect owner-declared excluded paths beside canonical siblings', async () => {
    const stat = vi.fn(async () => ({ sizeBytes: 4, modifiedAtMs: 20 }));
    const readDirectory = vi.fn(async (directory: string) => {
      if (directory === '/workspace/neko') {
        return [
          { name: 'assets', type: 'directory' as const },
          { name: 'project.json', type: 'file' as const },
        ];
      }
      if (directory === '/workspace/neko/assets') {
        throw new Error('Retired linked-media storage must not be inspected.');
      }
      return [];
    });

    const entries = await searchResourceBrowserContentTree({
      absoluteRoot: '/workspace',
      absoluteDirectory: '/workspace/neko',
      locatorPrefix: '',
      query: '',
      limit: 20,
      rootDepth: -1,
      excludedDirectoryNames: new Set(),
      excludedLocatorPaths: new Set(['neko/assets']),
      files: { readDirectory, stat },
      joinAbsolutePath: (directory, childName) => `${directory}/${childName}`,
      relativePath: (root, target) => target.slice(root.length + 1),
      classify: () => ({
        include: true,
        mediaType: 'file',
        capabilities: ['read'],
      }),
    });

    expect(entries.map((entry) => entry.label)).toEqual(['project.json']);
    expect(entries[0]?.locator).toEqual({ kind: 'workspace-file', path: 'neko/project.json' });
    expect(readDirectory).not.toHaveBeenCalledWith('/workspace/neko/assets');
    expect(stat).toHaveBeenCalledTimes(1);
  });

  it('projects portable hierarchy through the injected host-neutral file port', async () => {
    const readDirectory = vi.fn(async (directory: string) => {
      switch (directory) {
        case '/workspace':
          return [
            { name: 'node_modules', type: 'directory' as const },
            { name: 'characters', type: 'directory' as const },
            { name: 'cover.png', type: 'file' as const },
            { name: 'linked', type: 'symlink' as const },
          ];
        case '/workspace/characters':
          return [{ name: 'hero.glb', type: 'file' as const }];
        default:
          throw new Error(`Unexpected directory '${directory}'.`);
      }
    });

    const result = await searchResourceBrowserContentTree({
      absoluteRoot: '/workspace',
      locatorPrefix: '',
      query: '',
      limit: 20,
      rootDepth: -1,
      excludedDirectoryNames: new Set(['node_modules']),
      files: {
        readDirectory,
        stat: vi.fn(async () => ({ sizeBytes: 42, modifiedAtMs: 1000 })),
      },
      joinAbsolutePath: (directory, childName) => `${directory}/${childName}`,
      relativePath: (root, target) => target.slice(root.length + 1),
      classify: (locatorPath) => ({
        include: true,
        mediaType: locatorPath.endsWith('.png') ? 'image' : 'model',
        capabilities: ['read', 'preview'],
      }),
    });

    expect(result).toEqual([
      expect.objectContaining({
        label: 'characters',
        role: 'directory',
        depth: 0,
        locator: { kind: 'workspace-file', path: 'characters' },
      }),
      expect.objectContaining({
        label: 'cover.png',
        role: 'content',
        depth: 0,
        locator: { kind: 'workspace-file', path: 'cover.png' },
      }),
      expect.objectContaining({
        label: 'hero.glb',
        role: 'content',
        depth: 1,
        parentLocator: { kind: 'workspace-file', path: 'characters' },
        locator: { kind: 'workspace-file', path: 'characters/hero.glb' },
      }),
    ]);
    expect(readDirectory).not.toHaveBeenCalledWith('/workspace/node_modules');
  });

  it('reads only direct children for an initial or expanded container', async () => {
    const readDirectory = vi.fn(async (directory: string) => {
      if (directory === '/workspace') {
        return [{ name: 'characters', type: 'directory' as const }];
      }
      throw new Error(`Unexpected recursive read '${directory}'.`);
    });

    const result = await readResourceBrowserContentChildren({
      absoluteRoot: '/workspace',
      locatorPrefix: '',
      limit: 20,
      rootDepth: -1,
      excludedDirectoryNames: new Set(),
      files: {
        readDirectory,
        stat: vi.fn(async () => ({})),
      },
      joinAbsolutePath: (directory, childName) => `${directory}/${childName}`,
      relativePath: (root, target) => target.slice(root.length + 1),
      classify: () => ({
        include: true,
        mediaType: 'file',
        capabilities: ['read'],
      }),
    });

    expect(result).toEqual([
      expect.objectContaining({
        label: 'characters',
        role: 'directory',
        depth: 0,
      }),
    ]);
    expect(readDirectory).toHaveBeenCalledTimes(1);
  });

  it('keeps search bounded and rejects invalid limits', async () => {
    await expect(
      searchResourceBrowserContentTree({
        absoluteRoot: '/workspace',
        locatorPrefix: '',
        query: '',
        limit: 0,
        rootDepth: -1,
        excludedDirectoryNames: new Set(),
        files: {
          readDirectory: vi.fn(),
          stat: vi.fn(),
        },
        joinAbsolutePath: (directory, childName) => `${directory}/${childName}`,
        relativePath: (root, target) => target.slice(root.length + 1),
        classify: () => ({
          include: true,
          mediaType: 'file',
          capabilities: ['read'],
        }),
      }),
    ).rejects.toThrow('positive integer');
  });
});

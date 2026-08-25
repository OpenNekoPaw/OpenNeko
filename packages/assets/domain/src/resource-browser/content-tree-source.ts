import type { MediaLibraryProjectionEntry } from '@neko/assets-domain/contracts';
import type { WorkspaceFileContentLocator } from '@neko/content-domain';
import type { ResourceBrowserContentEntry } from './ports';

export type ResourceBrowserContentTreeEntryType = 'file' | 'directory' | 'symlink' | 'unknown';

export interface ResourceBrowserContentTreePort {
  readDirectory(absoluteDirectory: string): Promise<
    readonly {
      readonly name: string;
      readonly type: ResourceBrowserContentTreeEntryType;
    }[]
  >;
  stat(absolutePath: string): Promise<{
    readonly sizeBytes?: number;
    readonly modifiedAtMs?: number;
  }>;
}

export interface ResourceBrowserContentClassification {
  readonly include: boolean;
  readonly mediaType: string;
  readonly capabilities: MediaLibraryProjectionEntry['capabilities'];
}

export interface ReadResourceBrowserContentTreeInput {
  readonly absoluteRoot: string;
  readonly absoluteDirectory?: string;
  readonly locatorPrefix: string;
  readonly query: string;
  readonly limit: number;
  readonly rootDepth: number;
  readonly libraryName?: string;
  readonly excludedDirectoryNames: ReadonlySet<string>;
  readonly excludedLocatorPaths?: ReadonlySet<string>;
  readonly files: ResourceBrowserContentTreePort;
  readonly joinAbsolutePath: (directory: string, childName: string) => string;
  readonly relativePath: (root: string, target: string) => string;
  readonly classify: (locatorPath: string) => ResourceBrowserContentClassification;
}

export async function readResourceBrowserContentChildren(
  input: Omit<ReadResourceBrowserContentTreeInput, 'query'>,
): Promise<readonly ResourceBrowserContentEntry[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error('Resource Browser content children limit must be a positive integer.');
  }
  const entries: ResourceBrowserContentEntry[] = [];
  await readDirectoryChildren(
    { ...input, query: '' },
    input.absoluteDirectory ?? input.absoluteRoot,
    entries,
    false,
  );
  return entries;
}

export async function searchResourceBrowserContentTree(
  input: ReadResourceBrowserContentTreeInput,
): Promise<readonly ResourceBrowserContentEntry[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error('Resource Browser content tree limit must be a positive integer.');
  }
  const entries: ResourceBrowserContentEntry[] = [];
  await walkDirectory(input, input.absoluteDirectory ?? input.absoluteRoot, entries);
  return entries;
}

async function walkDirectory(
  input: ReadResourceBrowserContentTreeInput,
  absoluteDirectory: string,
  entries: ResourceBrowserContentEntry[],
): Promise<void> {
  if (entries.length >= input.limit) return;
  const directories = await readDirectoryChildren(input, absoluteDirectory, entries, true);
  for (const absoluteChildDirectory of directories) {
    if (entries.length >= input.limit) return;
    await walkDirectory(input, absoluteChildDirectory, entries);
  }
}

async function readDirectoryChildren(
  input: ReadResourceBrowserContentTreeInput,
  absoluteDirectory: string,
  entries: ResourceBrowserContentEntry[],
  searchDescendants: boolean,
): Promise<readonly string[]> {
  if (entries.length >= input.limit) return [];
  const children = [...(await input.files.readDirectory(absoluteDirectory))].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const directories: string[] = [];
  for (const child of children) {
    if (entries.length >= input.limit) return directories;
    if (!isResourceBrowserContentNameVisible(child.name)) continue;
    if (child.type === 'symlink') continue;
    const absolutePath = input.joinAbsolutePath(absoluteDirectory, child.name);
    const relativePath = portableRelativePath(input.relativePath(input.absoluteRoot, absolutePath));
    const locatorPath = createLocatorPath(input.locatorPrefix, relativePath);
    if (input.excludedLocatorPaths?.has(locatorPath.toLocaleLowerCase('en-US'))) continue;
    if (child.type === 'directory') {
      if (input.excludedDirectoryNames.has(child.name)) continue;
      directories.push(absolutePath);
      if (matchesQuery(locatorPath, input.query)) {
        entries.push({
          locator: { file: { authority: 'workspace', path: locatorPath } },
          label: child.name,
          description: portableParentPath(locatorPath),
          availability: 'available',
          capabilities: ['read'],
          metadata: { mediaType: 'directory' },
          role: 'directory',
          depth: input.rootDepth + portablePathDepth(relativePath),
          ...(input.libraryName ? { libraryName: input.libraryName } : {}),
          ...parentLocator(input.locatorPrefix, relativePath),
        });
      }
      if (!searchDescendants && entries.length >= input.limit) return directories;
      continue;
    }
    if (child.type !== 'file' || !matchesQuery(locatorPath, input.query)) continue;
    const classification = input.classify(locatorPath);
    if (!classification.include) continue;
    const stat = await input.files.stat(absolutePath);
    entries.push({
      locator: { file: { authority: 'workspace', path: locatorPath } },
      label: child.name,
      description: portableParentPath(locatorPath),
      availability: 'available',
      capabilities: classification.capabilities,
      metadata: {
        mediaType: classification.mediaType,
        ...(stat.sizeBytes === undefined ? {} : { byteLength: stat.sizeBytes }),
        ...(stat.modifiedAtMs === undefined
          ? {}
          : { modifiedAt: new Date(stat.modifiedAtMs).toISOString() }),
      },
      role: 'content',
      depth: input.rootDepth + portablePathDepth(relativePath),
      ...(input.libraryName ? { libraryName: input.libraryName } : {}),
      ...parentLocator(input.locatorPrefix, relativePath),
    });
  }
  return directories;
}

export function isResourceBrowserContentNameVisible(name: string): boolean {
  return !name.startsWith('.');
}

function matchesQuery(locatorPath: string, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery.length === 0 || locatorPath.toLocaleLowerCase().includes(normalizedQuery);
}

function portableRelativePath(value: string): string {
  const portable = value.split('\\').join('/');
  if (
    portable.length === 0 ||
    portable.startsWith('/') ||
    portable === '..' ||
    portable.startsWith('../')
  ) {
    throw new Error('Resource Browser encountered a non-portable relative path.');
  }
  return portable;
}

function createLocatorPath(locatorPrefix: string, relativePath: string): string {
  return [locatorPrefix, relativePath].filter(Boolean).join('/');
}

function portablePathDepth(relativePath: string): number {
  return relativePath.split('/').filter(Boolean).length;
}

function portableParentPath(locatorPath: string): string {
  const segments = locatorPath.split('/');
  segments.pop();
  return segments.join('/') || '.';
}

function parentLocator(
  locatorPrefix: string,
  relativePath: string,
): { readonly parentLocator?: WorkspaceFileContentLocator } {
  const segments = relativePath.split('/');
  segments.pop();
  const parentPath = [locatorPrefix, segments.join('/')].filter(Boolean).join('/');
  return parentPath
    ? { parentLocator: { file: { authority: 'workspace', path: parentPath } } }
    : {};
}

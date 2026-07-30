import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DesktopHomeMediaLibraryLocationKind } from '../shared/home-management-contract';

const LOCATION_KINDS = ['local', 'nas', 'cloud'] as const;

export interface DesktopGlobalMediaLibraryConnection {
  readonly libraryId: string;
  readonly name: string;
  readonly locationKind: DesktopHomeMediaLibraryLocationKind;
  readonly linkPath: string;
  readonly availability: 'available' | 'unavailable';
  readonly modifiedAt?: string;
}

export async function createDesktopGlobalMediaLibraryConnection(input: {
  readonly mediaLibraryRoot: string;
  readonly sourceDirectory: string;
  readonly locationKind: DesktopHomeMediaLibraryLocationKind;
}): Promise<{ readonly libraryId: string }> {
  const sourceStat = await fs.stat(input.sourceDirectory);
  if (!sourceStat.isDirectory()) {
    throw new Error('Desktop global Media Library source must be a directory.');
  }
  const name = requireMediaLibraryName(path.basename(input.sourceDirectory));
  const groupRoot = path.join(input.mediaLibraryRoot, input.locationKind);
  await fs.mkdir(groupRoot, { recursive: true });
  const linkPath = path.join(groupRoot, name);
  if (await pathExists(linkPath)) {
    throw new Error(`Desktop global Media Library '${name}' already exists.`);
  }
  await fs.symlink(
    await fs.realpath(input.sourceDirectory),
    linkPath,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return {
    libraryId: createDesktopGlobalMediaLibraryId(input.locationKind, name),
  };
}

export async function listDesktopGlobalMediaLibraryConnections(
  mediaLibraryRoot: string,
): Promise<readonly DesktopGlobalMediaLibraryConnection[]> {
  await fs.mkdir(mediaLibraryRoot, { recursive: true });
  const connections: DesktopGlobalMediaLibraryConnection[] = [];
  for (const locationKind of LOCATION_KINDS) {
    const groupRoot = path.join(mediaLibraryRoot, locationKind);
    await fs.mkdir(groupRoot, { recursive: true });
    const entries = await fs.readdir(groupRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue;
      const name = requireMediaLibraryName(entry.name);
      const linkPath = path.join(groupRoot, name);
      try {
        const stat = await fs.stat(linkPath);
        if (!stat.isDirectory()) {
          connections.push({
            libraryId: createDesktopGlobalMediaLibraryId(locationKind, name),
            name,
            locationKind,
            linkPath,
            availability: 'unavailable',
          });
          continue;
        }
        connections.push({
          libraryId: createDesktopGlobalMediaLibraryId(locationKind, name),
          name,
          locationKind,
          linkPath,
          availability: 'available',
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch (error: unknown) {
        if (!isMissingPathError(error)) throw error;
        connections.push({
          libraryId: createDesktopGlobalMediaLibraryId(locationKind, name),
          name,
          locationKind,
          linkPath,
          availability: 'unavailable',
        });
      }
    }
  }
  return connections;
}

export async function removeDesktopGlobalMediaLibraryConnection(input: {
  readonly mediaLibraryRoot: string;
  readonly libraryId: string;
}): Promise<void> {
  const linkPath = resolveDesktopGlobalMediaLibraryLinkPath(input);
  const stat = await fs.lstat(linkPath);
  if (!stat.isSymbolicLink()) {
    throw new Error('Desktop global Media Library connection is not a managed link.');
  }
  await fs.unlink(linkPath);
}

export async function resolveDesktopGlobalMediaLibraryTarget(input: {
  readonly mediaLibraryRoot: string;
  readonly libraryId: string;
}): Promise<string> {
  const linkPath = resolveDesktopGlobalMediaLibraryLinkPath(input);
  const linkStat = await fs.lstat(linkPath);
  if (!linkStat.isSymbolicLink()) {
    throw new Error('Desktop global Media Library connection is not a managed link.');
  }
  const target = await fs.realpath(linkPath);
  const targetStat = await fs.stat(target);
  if (!targetStat.isDirectory()) {
    throw new Error('Desktop global Media Library target is not a directory.');
  }
  return target;
}

export function createDesktopGlobalMediaLibraryId(
  locationKind: DesktopHomeMediaLibraryLocationKind,
  name: string,
): string {
  return `media-library:${locationKind}:${requireMediaLibraryName(name)}`;
}

export function parseDesktopGlobalMediaLibraryId(libraryId: string): {
  readonly locationKind: DesktopHomeMediaLibraryLocationKind;
  readonly name: string;
} {
  const match = /^media-library:(local|nas|cloud):([^:/\\]+)$/.exec(libraryId);
  const locationKind = match?.[1];
  const name = match?.[2];
  if (!locationKind || !name) {
    throw new Error('Desktop global Media Library identity is invalid.');
  }
  return {
    locationKind: requireLocationKind(locationKind),
    name: requireMediaLibraryName(name),
  };
}

export function resolveDesktopGlobalMediaLibraryLinkPath(input: {
  readonly mediaLibraryRoot: string;
  readonly libraryId: string;
}): string {
  const parsed = parseDesktopGlobalMediaLibraryId(input.libraryId);
  return path.join(input.mediaLibraryRoot, parsed.locationKind, parsed.name);
}

function requireLocationKind(value: string): DesktopHomeMediaLibraryLocationKind {
  if (value !== 'local' && value !== 'nas' && value !== 'cloud') {
    throw new Error('Desktop global Media Library location kind is invalid.');
  }
  return value;
}

function requireMediaLibraryName(value: string): string {
  if (
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes(':')
  ) {
    throw new Error('Desktop global Media Library name is invalid.');
  }
  return value;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error: unknown) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}

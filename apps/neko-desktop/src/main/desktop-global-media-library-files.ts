import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ContentFingerprint,
  ContentIoDiagnostic,
  ContentLocator,
  ContentReadService,
} from '@neko/shared';
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

export type DesktopGlobalMediaLibraryCopyResult =
  | {
      readonly status: 'copied';
      readonly source: ContentLocator;
      readonly globalLibraryId: string;
      readonly entryId: string;
      readonly byteLength: number;
      readonly fingerprint: ContentFingerprint;
    }
  | {
      readonly status: 'unavailable';
      readonly source: ContentLocator;
      readonly globalLibraryId: string;
      readonly diagnostic: ContentIoDiagnostic;
    };

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

/**
 * Copies content into an explicitly selected Desktop-global Media Library.
 * The returned entryId is portable; the physical target path never leaves this owner.
 */
export async function copyDesktopGlobalMediaLibraryContent(input: {
  readonly mediaLibraryRoot: string;
  readonly globalLibraryId: string;
  readonly source: ContentLocator;
  readonly destinationDirectory: string;
  readonly fileName: string;
  readonly conflict: 'fail-if-exists' | 'replace';
  readonly reader: ContentReadService;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}): Promise<DesktopGlobalMediaLibraryCopyResult> {
  if (input.signal?.aborted) return copyUnavailable(input, 'content-cancelled');
  if (!isPortableDirectory(input.destinationDirectory) || !isSafeFileName(input.fileName)) {
    return copyUnavailable(input, 'content-unauthorized');
  }

  const source = await input.reader.read(input.source, {
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (source.status === 'unavailable') {
    return copyUnavailable(input, source.diagnostic.code);
  }
  if (source.offset !== 0) return copyUnavailable(input, 'content-read-failed');

  try {
    const libraryRoot = await resolveDesktopGlobalMediaLibraryTarget({
      mediaLibraryRoot: input.mediaLibraryRoot,
      libraryId: input.globalLibraryId,
    });
    const resolvedLibraryRoot = await fs.realpath(libraryRoot);
    const resolvedDestinationDirectory = await ensureContainedDirectory(
      resolvedLibraryRoot,
      portableSegments(input.destinationDirectory),
    );

    const destinationPath = path.join(resolvedDestinationDirectory, input.fileName);
    const temporaryPath = path.join(
      resolvedDestinationDirectory,
      `.${input.fileName}.${randomUUID()}.tmp`,
    );
    try {
      const handle = await fs.open(temporaryPath, 'wx', 0o600);
      try {
        if (input.signal?.aborted) return copyUnavailable(input, 'content-cancelled');
        await handle.writeFile(source.bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (input.signal?.aborted) return copyUnavailable(input, 'content-cancelled');
      if (input.conflict === 'fail-if-exists') {
        await fs.link(temporaryPath, destinationPath);
        await fs.rm(temporaryPath);
      } else {
        await fs.rename(temporaryPath, destinationPath);
      }
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    return {
      status: 'copied',
      source: input.source,
      globalLibraryId: input.globalLibraryId,
      entryId: [...portableSegments(input.destinationDirectory), input.fileName].join('/'),
      byteLength: source.bytes.byteLength,
      fingerprint: {
        strategy: 'sha256',
        value: `sha256:${createHash('sha256').update(source.bytes).digest('hex')}`,
      },
    };
  } catch (error: unknown) {
    return copyUnavailable(input, copyDiagnosticCode(error));
  }
}

function createDesktopGlobalMediaLibraryId(
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

function resolveDesktopGlobalMediaLibraryLinkPath(input: {
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

function isPortableDirectory(value: string): boolean {
  if (value !== value.normalize('NFC')) return false;
  if (value === '') return true;
  if (value.startsWith('/') || value.endsWith('/') || value.includes('\\')) return false;
  return portableSegments(value).every(
    (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
  );
}

function portableSegments(value: string): readonly string[] {
  return value === '' ? [] : value.split('/');
}

function isSafeFileName(value: string): boolean {
  return (
    value.length > 0 &&
    value === value.normalize('NFC') &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\')
  );
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`))
  );
}

async function ensureContainedDirectory(
  resolvedRoot: string,
  segments: readonly string[],
): Promise<string> {
  let current = resolvedRoot;
  for (const segment of segments) {
    const candidate = path.join(current, segment);
    try {
      const existing = await fs.lstat(candidate);
      if (!existing.isDirectory() || existing.isSymbolicLink()) {
        throw unauthorizedPathError();
      }
    } catch (error: unknown) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      await fs.mkdir(candidate);
    }
    const resolvedCandidate = await fs.realpath(candidate);
    if (!isInside(resolvedCandidate, resolvedRoot)) throw unauthorizedPathError();
    current = resolvedCandidate;
  }
  return current;
}

function unauthorizedPathError(): Error & { readonly code: 'EACCES' } {
  return Object.assign(new Error('Global Media Library destination is unauthorized.'), {
    code: 'EACCES' as const,
  });
}

function copyUnavailable(
  input: {
    readonly source: ContentLocator;
    readonly globalLibraryId: string;
  },
  code: ContentIoDiagnostic['code'],
): Extract<DesktopGlobalMediaLibraryCopyResult, { status: 'unavailable' }> {
  return {
    status: 'unavailable',
    source: input.source,
    globalLibraryId: input.globalLibraryId,
    diagnostic: { code },
  };
}

function copyDiagnosticCode(error: unknown): ContentIoDiagnostic['code'] {
  if (isNodeError(error, 'EEXIST')) return 'content-conflict';
  if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) return 'content-missing';
  if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
    return 'content-unauthorized';
  }
  return 'content-write-failed';
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
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

import { isAbsolute, relative, resolve, sep } from 'node:path';

export const DESKTOP_EXTENSION_MAX_EXPANDED_BYTES = 1_500_000_000;
export const DESKTOP_EXTENSION_MAX_ARCHIVE_FILES = 20_000;

export function assertDesktopExtensionDiskBudget(
  availableBytes: number,
  archiveBytes: number,
  archive: 'zip' | 'tar.gz',
): void {
  if (
    !Number.isSafeInteger(availableBytes) ||
    availableBytes < 0 ||
    !Number.isSafeInteger(archiveBytes) ||
    archiveBytes <= 0
  ) {
    throw new Error('Extension artifact disk budget facts are invalid.');
  }
  const extractionBytes = DESKTOP_EXTENSION_MAX_EXPANDED_BYTES * (archive === 'tar.gz' ? 2 : 1);
  const requiredBytes = archiveBytes + extractionBytes;
  if (!Number.isSafeInteger(requiredBytes) || availableBytes < requiredBytes) {
    throw new Error('Extension artifact staging has insufficient disk space.');
  }
}

export class DesktopExtensionArchiveInventory {
  private readonly entries = new Map<string, 'file' | 'directory'>();
  private readonly pathsWithChildren = new Set<string>();
  private expandedBytes = 0;

  add(rawPath: string, kind: 'file' | 'directory', size: number): string {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Extension archive entry size is invalid.');
    }
    const path = normalizeDesktopExtensionArchivePath(rawPath);
    const key = path.toLocaleLowerCase('en-US');
    if (this.entries.has(key)) {
      throw new Error('Extension archive contains a duplicate or case-colliding path.');
    }
    const segments = key.split('/');
    const parents = segments
      .slice(1)
      .map((_segment, index) => segments.slice(0, index + 1).join('/'));
    for (const parent of parents) {
      if (this.entries.get(parent) === 'file') {
        throw new Error('Extension archive places an entry below a file.');
      }
    }
    if (kind === 'file' && this.pathsWithChildren.has(key)) {
      throw new Error('Extension archive replaces a directory with a file.');
    }
    if (this.entries.size >= DESKTOP_EXTENSION_MAX_ARCHIVE_FILES) {
      throw new Error('Extension archive contains too many entries.');
    }
    if (this.expandedBytes + size > DESKTOP_EXTENSION_MAX_EXPANDED_BYTES) {
      throw new Error('Extension archive expanded size exceeds its limit.');
    }
    for (const parent of parents) this.pathsWithChildren.add(parent);
    this.entries.set(key, kind);
    this.expandedBytes += size;
    return path;
  }
}

export function normalizeDesktopExtensionArchivePath(value: string): string {
  const path = value.replace(/\/$/u, '');
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) {
    throw new Error('Extension archive path is unsafe.');
  }
  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        segment.includes(':') ||
        isWindowsReservedSegment(segment),
    )
  ) {
    throw new Error('Extension archive path is unsafe on a supported platform.');
  }
  return segments.join('/');
}

export function resolveDesktopExtensionArchiveTarget(root: string, path: string): string {
  const target = resolve(root, path);
  const fromRoot = relative(resolve(root), target);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('Extension archive target escaped staging.');
  }
  return target;
}

function isWindowsReservedSegment(segment: string): boolean {
  const stem = segment.split('.', 1)[0]?.toLocaleLowerCase('en-US') ?? '';
  if (['con', 'prn', 'aux', 'nul'].includes(stem)) return true;
  if (stem.length !== 4 || (stem.slice(0, 3) !== 'com' && stem.slice(0, 3) !== 'lpt')) {
    return false;
  }
  const unit = stem.charCodeAt(3) - '0'.charCodeAt(0);
  return unit >= 1 && unit <= 9;
}

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DESKTOP_EXTENSION_MAX_ARCHIVE_FILES,
  DESKTOP_EXTENSION_MAX_EXPANDED_BYTES,
  DesktopExtensionArchiveInventory,
  assertDesktopExtensionDiskBudget,
  normalizeDesktopExtensionArchivePath,
  resolveDesktopExtensionArchiveTarget,
} from './desktop-extension-archive-policy';

describe('Desktop extension archive policy', () => {
  it('requires space for the archive, output, and TAR scratch when applicable', () => {
    const archiveBytes = 123;
    const zipRequiredBytes = archiveBytes + DESKTOP_EXTENSION_MAX_EXPANDED_BYTES;
    const tarRequiredBytes = archiveBytes + DESKTOP_EXTENSION_MAX_EXPANDED_BYTES * 2;

    expect(() =>
      assertDesktopExtensionDiskBudget(zipRequiredBytes - 1, archiveBytes, 'zip'),
    ).toThrow('insufficient disk space');
    expect(() =>
      assertDesktopExtensionDiskBudget(zipRequiredBytes, archiveBytes, 'zip'),
    ).not.toThrow();
    expect(() =>
      assertDesktopExtensionDiskBudget(tarRequiredBytes - 1, archiveBytes, 'tar.gz'),
    ).toThrow('insufficient disk space');
    expect(() =>
      assertDesktopExtensionDiskBudget(tarRequiredBytes, archiveBytes, 'tar.gz'),
    ).not.toThrow();
  });

  it('enforces the production file-count limit without extracting poison entries', () => {
    const inventory = new DesktopExtensionArchiveInventory();
    for (let index = 0; index < DESKTOP_EXTENSION_MAX_ARCHIVE_FILES; index += 1) {
      inventory.add(`runtime/entry-${String(index).padStart(5, '0')}`, 'file', 0);
    }

    expect(() => inventory.add('runtime/one-too-many', 'file', 0)).toThrow('too many entries');
  });

  it('enforces the production expanded-byte limit before writing an entry', () => {
    const inventory = new DesktopExtensionArchiveInventory();
    inventory.add('runtime/within-limit', 'file', DESKTOP_EXTENSION_MAX_EXPANDED_BYTES);

    expect(() => inventory.add('runtime/over-limit', 'file', 1)).toThrow(
      'expanded size exceeds its limit',
    );
  });

  it.each([
    '../escape',
    '/absolute',
    'runtime\\tool',
    'runtime/CON.txt',
    'runtime/com1',
    'runtime/trailing.',
    'runtime/trailing ',
    'runtime/drive:C',
  ])('rejects cross-platform unsafe archive path %s', (path) => {
    expect(() => normalizeDesktopExtensionArchivePath(path)).toThrow('unsafe');
  });

  it('rejects case collisions and file/directory hierarchy conflicts', () => {
    const collision = new DesktopExtensionArchiveInventory();
    collision.add('Runtime/Tool', 'file', 1);
    expect(() => collision.add('runtime/tool', 'file', 1)).toThrow(
      'duplicate or case-colliding path',
    );

    const belowFile = new DesktopExtensionArchiveInventory();
    belowFile.add('runtime', 'file', 1);
    expect(() => belowFile.add('runtime/tool', 'file', 1)).toThrow('below a file');

    const replacesDirectory = new DesktopExtensionArchiveInventory();
    replacesDirectory.add('runtime/tool', 'file', 1);
    expect(() => replacesDirectory.add('runtime', 'file', 1)).toThrow('replaces a directory');
  });

  it('resolves only non-root targets inside the operation staging authority', () => {
    const stagingRoot = join(tmpdir(), 'openneko-extension-staging');
    expect(resolveDesktopExtensionArchiveTarget(stagingRoot, 'runtime/tool')).toBe(
      join(stagingRoot, 'runtime', 'tool'),
    );
    expect(() => resolveDesktopExtensionArchiveTarget(stagingRoot, '../escape')).toThrow(
      'escaped staging',
    );
  });
});

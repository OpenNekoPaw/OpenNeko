import { describe, expect, it } from 'vitest';
import {
  createBundleEntryLocator,
  normalizeBundleEntryPath,
  resolveBundleEntryPath,
  validateBundleArchiveMetadata,
} from '../bundle-locator';

describe('bundle locator contracts', () => {
  it('creates fragment locators from normalized entry paths', () => {
    expect(createBundleEntryLocator('./sakura.zip', 'textures\\texture_00.png')).toEqual({
      ok: true,
      entryPath: 'textures/texture_00.png',
      locator: {
        bundlePath: './sakura.zip',
        entryPath: 'textures/texture_00.png',
        fragmentRef: './sakura.zip#textures/texture_00.png',
      },
    });
  });

  it('rejects unsafe direct archive entry paths', () => {
    expect(normalizeBundleEntryPath('/textures/a.png')).toMatchObject({
      ok: false,
      issue: 'absolute',
    });
    expect(normalizeBundleEntryPath('C:/textures/a.png')).toMatchObject({
      ok: false,
      issue: 'drive-letter',
    });
    expect(normalizeBundleEntryPath('textures/../a.png')).toMatchObject({
      ok: false,
      issue: 'parent-segment',
    });
    expect(normalizeBundleEntryPath('textures//a.png')).toMatchObject({
      ok: false,
      issue: 'empty-segment',
    });
  });

  it('resolves manifest-relative references from nested manifests', () => {
    expect(resolveBundleEntryPath('avatars/sakura/model3.json', 'textures/texture_00.png')).toEqual(
      {
        ok: true,
        entryPath: 'avatars/sakura/textures/texture_00.png',
      },
    );
    expect(resolveBundleEntryPath('avatars/sakura/model3.json', '../shared/physics3.json')).toEqual(
      {
        ok: true,
        entryPath: 'avatars/shared/physics3.json',
      },
    );
  });

  it('rejects manifest references that escape archive boundaries', () => {
    expect(resolveBundleEntryPath('model3.json', '../escape.moc3')).toMatchObject({
      ok: false,
      issue: 'parent-segment',
    });
  });

  it('validates duplicate entries and size limits after normalization', () => {
    const result = validateBundleArchiveMetadata(
      [
        { entryPath: 'textures/a.png', uncompressedSize: 10 },
        { entryPath: 'textures\\a.png', uncompressedSize: 10 },
        { entryPath: 'large.bin', uncompressedSize: 200 },
      ],
      { maxEntryBytes: 100, maxTotalUncompressedBytes: 150 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual([
        'duplicate-entry',
        'entry-too-large',
        'archive-too-large',
      ]);
    }
  });
});

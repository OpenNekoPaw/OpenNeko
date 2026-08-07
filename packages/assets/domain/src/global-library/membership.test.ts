import { describe, expect, it } from 'vitest';
import {
  assertAssetLibraryMembershipRegistration,
  assertAssetLibrarySourceRelativePath,
} from './membership';

describe('Asset Library membership contract', () => {
  it('accepts a stable membership with a package-relative source', () => {
    expect(() =>
      assertAssetLibraryMembershipRegistration({
        membershipId: 'membership-1',
        sourceRelativePath: 'characters/hero.png',
        label: 'hero.png',
        mediaType: 'image',
        byteLength: 42,
        modifiedAt: '2026-08-05T08:00:00.000Z',
        registeredAt: '2026-08-05T08:01:00.000Z',
      }),
    ).not.toThrow();
  });

  it.each(['/tmp/hero.png', 'C:\\hero.png', '../hero.png', 'folder/../hero.png', 'a\\b.png'])(
    'rejects unsafe source path %s',
    (sourceRelativePath) => {
      expect(() => assertAssetLibrarySourceRelativePath(sourceRelativePath)).toThrow(
        'package-relative',
      );
    },
  );
});

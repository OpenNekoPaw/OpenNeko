import { describe, expect, it } from 'vitest';
import {
  resolveGeneratedAssetMediaKind,
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  sanitizeGeneratedAssetPathSegment,
} from '../generated-asset';

describe('generated asset path contracts', () => {
  it('resolves durable workspace generated roots by media kind', () => {
    expect(resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'image/png' })).toBe(
      'neko/generated/image',
    );
    expect(resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'audio/wav' })).toBe(
      'neko/generated/audio',
    );
    expect(resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'video/mp4' })).toBe(
      'neko/generated/video',
    );
    expect(
      resolveWorkspaceGeneratedAssetRelativeDirectory({
        mimeType: 'application/vnd.neko.storyboard+json',
      }),
    ).toBe('neko/generated/storyboard');
    expect(
      resolveWorkspaceGeneratedAssetRelativeDirectory({ mimeType: 'application/octet-stream' }),
    ).toBe('neko/generated/file');
  });

  it('accepts explicit media kind only for canonical generated asset directories', () => {
    expect(resolveGeneratedAssetMediaKind({ mediaKind: 'Image', mimeType: 'video/mp4' })).toBe(
      'image',
    );
    expect(resolveGeneratedAssetMediaKind({ mediaKind: 'thumbnail', mimeType: 'image/png' })).toBe(
      'image',
    );
    expect(sanitizeGeneratedAssetPathSegment(' Story Board! ')).toBe('story-board');
  });
});

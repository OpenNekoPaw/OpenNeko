import { describe, expect, it } from 'vitest';
import type { AssetManifest, MediaKind } from '@neko/shared';
import { VoicePackInstallTarget } from './VoicePackInstallTarget';

describe('VoicePackInstallTarget', () => {
  it('routes voice-pack media packages to the shared voice-pack preset root', () => {
    const target = new VoicePackInstallTarget('/tmp/voice-pack');
    const manifest = voicePackManifest('voice-pack');

    expect(() => target.validateManifest(manifest)).not.toThrow();
    expect(target.getInstallPath(manifest)).toBe('/tmp/voice-pack/studio/sakura-jp');
  });

  it('rejects non voice-pack media packages', () => {
    const target = new VoicePackInstallTarget('/tmp/voice-pack');

    expect(() => target.validateManifest(voicePackManifest('audio'))).toThrow(
      'cannot install media kind',
    );
  });
});

function voicePackManifest(mediaKind: MediaKind): AssetManifest {
  return {
    id: '@studio/sakura-jp',
    name: 'sakura-jp',
    version: '1.0.0',
    type: 'media',
    source: { kind: 'local', path: '/tmp/sakura-jp' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['voice'],
      checksum: 'sha256-test',
      publisherId: 'studio',
    },
    typeMetadata: {
      type: 'media',
      data: {
        mediaKind,
        fileSize: 1,
      },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

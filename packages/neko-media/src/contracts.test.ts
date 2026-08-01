import { describe, expect, it } from 'vitest';
import { isMediaResourceUrl } from './contracts';

describe('media resource URL contract', () => {
  it('accepts only the unified OpenNeko resource origin with an opaque id', () => {
    expect(isMediaResourceUrl('openneko://resource/0123456789abcdefghijklmnopqrstuv')).toBe(true);
    expect(
      isMediaResourceUrl(
        'openneko://resource/0123456789abcdefghijklmnopqrstuv/textures/albedo.png',
      ),
    ).toBe(true);
  });

  it.each([
    'neko-app://desktop/token',
    'neko-media://desktop/token',
    'opennekomedia://resource/token',
    'file:///private/video.mp4',
    'data:video/mp4;base64,AAAA',
    'media://desktop/token',
    'video://desktop/token',
    'audio://desktop/token',
    'http://127.0.0.1:43125/v1/resources/token',
    'openneko://desktop/0123456789abcdefghijklmnopqrstuv',
    'openneko://resource/short',
  ])('rejects non-canonical media URL %s', (url) => {
    expect(isMediaResourceUrl(url)).toBe(false);
  });

  it.each(['blob:openneko://resource/live-capture', 'mediastream:camera', 'webrtc:call-session'])(
    'does not represent live capture as a finite resource URL %s',
    (url) => {
      expect(isMediaResourceUrl(url)).toBe(false);
    },
  );
});

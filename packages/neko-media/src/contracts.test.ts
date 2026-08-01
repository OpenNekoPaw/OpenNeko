import { describe, expect, it } from 'vitest';
import { isMediaTransport, isMediaTransportUrl } from './contracts';

describe('media transport contract', () => {
  it('accepts only an explicit loopback HTTP URL with an ephemeral port', () => {
    expect(isMediaTransport('http')).toBe(true);
    expect(isMediaTransport('authorized')).toBe(false);
    expect(isMediaTransportUrl('http://127.0.0.1:43125/v1/resources/token', 'http')).toBe(true);
  });

  it.each([
    'neko-media://desktop/token',
    'file:///private/video.mp4',
    'data:video/mp4;base64,AAAA',
    'media://desktop/token',
    'video://desktop/token',
    'audio://desktop/token',
    'http://localhost:43125/v1/resources/token',
    'http://127.0.0.1/v1/resources/token',
  ])('rejects non-canonical media URL %s', (url) => {
    expect(isMediaTransportUrl(url, 'http')).toBe(false);
  });

  it.each([
    'blob:http://127.0.0.1:43125/live-capture',
    'mediastream:camera',
    'webrtc:call-session',
  ])('does not represent live capture transport as a finite gateway URL %s', (url) => {
    expect(isMediaTransportUrl(url, 'http')).toBe(false);
  });
});

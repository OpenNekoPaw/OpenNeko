/**
 * Browser/Webview API capability detection for fMP4 feasibility analysis.
 *
 * Tests: WebCodecs, MediaSource (MSE), codec support, Web Audio, etc.
 */

export interface CapabilityResult {
  name: string;
  supported: boolean;
  detail?: string;
}

export interface CapabilityReport {
  results: CapabilityResult[];
  userAgent: string;
  timestamp: string;
}

export async function detectCapabilities(): Promise<CapabilityReport> {
  const results: CapabilityResult[] = [];

  function check(name: string, supported: boolean, detail?: string) {
    results.push({ name, supported, detail });
  }

  // ── WebCodecs ──
  check('VideoDecoder (WebCodecs)', typeof VideoDecoder !== 'undefined');
  check('AudioDecoder (WebCodecs)', typeof AudioDecoder !== 'undefined');
  check('EncodedVideoChunk', typeof EncodedVideoChunk !== 'undefined');
  check('EncodedAudioChunk', typeof EncodedAudioChunk !== 'undefined');

  // ── MediaSource (MSE) ──
  const hasMS = typeof MediaSource !== 'undefined';
  check('MediaSource', hasMS);
  check('ManagedMediaSource', 'ManagedMediaSource' in globalThis);

  // ── MSE isTypeSupported ──
  if (hasMS) {
    const mseTypes = [
      'video/mp4; codecs="avc1.640028"',
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4; codecs="avc1.640028, opus"',
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',
      'video/mp4; codecs="hev1.1.6.L93.B0"',
      'video/mp4; codecs="vp09.00.10.08"',
      'video/webm; codecs="vp8, opus"',
      'video/webm; codecs="vp9, opus"',
      'audio/mp4; codecs="opus"',
      'audio/mp4; codecs="mp4a.40.2"',
      'audio/webm; codecs="opus"',
    ];
    for (const t of mseTypes) {
      check(`MSE: ${t}`, MediaSource.isTypeSupported(t));
    }
  }

  // ── WebCodecs codec support (async) ──
  if (typeof VideoDecoder !== 'undefined') {
    const videoCodecs = [
      { name: 'H.264 High', codec: 'avc1.640028' },
      { name: 'H.264 Baseline', codec: 'avc1.42E01E' },
      { name: 'VP9', codec: 'vp09.00.10.08' },
      { name: 'HEVC', codec: 'hev1.1.6.L93.B0' },
      { name: 'AV1', codec: 'av01.0.01M.08' },
    ];
    for (const vc of videoCodecs) {
      try {
        const r = await VideoDecoder.isConfigSupported({
          codec: vc.codec,
          optimizeForLatency: true,
        });
        check(`WebCodecs Video: ${vc.name}`, !!r.supported);
      } catch {
        check(`WebCodecs Video: ${vc.name}`, false, 'exception');
      }
    }
  }

  if (typeof AudioDecoder !== 'undefined') {
    const audioCodecs = [
      { name: 'Opus', codec: 'opus', sr: 48000 },
      { name: 'AAC-LC', codec: 'mp4a.40.2', sr: 44100 },
      { name: 'FLAC', codec: 'flac', sr: 44100 },
    ];
    for (const ac of audioCodecs) {
      try {
        const r = await AudioDecoder.isConfigSupported({
          codec: ac.codec,
          sampleRate: ac.sr,
          numberOfChannels: 2,
        });
        check(`WebCodecs Audio: ${ac.name}`, !!r.supported);
      } catch {
        check(`WebCodecs Audio: ${ac.name}`, false, 'exception');
      }
    }
  }

  // ── Other APIs ──
  check('Web Audio API', typeof AudioContext !== 'undefined');
  check('WebSocket', typeof WebSocket !== 'undefined');
  check('Canvas 2D', !!document.createElement('canvas').getContext('2d'));
  check('OffscreenCanvas', typeof OffscreenCanvas !== 'undefined');
  check(
    'requestVideoFrameCallback',
    typeof HTMLVideoElement !== 'undefined' &&
      'requestVideoFrameCallback' in HTMLVideoElement.prototype,
  );

  return {
    results,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
}

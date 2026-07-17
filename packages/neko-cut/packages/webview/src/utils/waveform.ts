/**
 * Audio waveform generation utilities
 *
 * Delegates to neko-engine (Rust/FFmpeg) via MediaRequestProxy IPC.
 * - No CSP restrictions: file reading happens on native side
 * - Full format support: FFmpeg handles all audio/video codecs
 * - No file size limitations: native side streams the file
 * - Multi-channel support: engine returns per-channel peaks
 */

import { getMediaProxy } from '../services/mediaProxyFactory';
import { getLogger } from './logger';

const logger = getLogger('Waveform');

export interface WaveformData {
  peaks: number[]; // Normalized peak values (0-1), mono-mixed
  duration: number;
  sampleRate: number;
}

/**
 * Raw waveform data from neko-engine (multi-channel)
 */
interface EngineWaveformData {
  sampleRate: number;
  channels: number;
  peaksPerSecond: number;
  duration: number;
  peaks: number[][]; // peaks[channel][sampleIndex]
}

// Cache for generated waveforms (keyed by file path)
const waveformCache = new Map<string, EngineWaveformData>();

// Pending requests to avoid duplicate IPC calls
const pendingRequests = new Map<string, Promise<EngineWaveformData>>();

/**
 * Fetch raw waveform data from neko-engine (cached, deduplicated)
 */
async function fetchEngineWaveform(src: string): Promise<EngineWaveformData> {
  const cached = waveformCache.get(src);
  if (cached) return cached;

  const pending = pendingRequests.get(src);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const result = await getMediaProxy().getWaveform(src);
      waveformCache.set(src, result);
      return result;
    } finally {
      pendingRequests.delete(src);
    }
  })();

  pendingRequests.set(src, promise);
  return promise;
}

/**
 * Mix multi-channel peaks to mono by taking max across channels
 */
function mixToMono(peaks: number[][]): number[] {
  if (peaks.length === 0) return [];
  if (peaks.length === 1) return peaks[0];

  const length = peaks[0].length;
  const mono = new Array<number>(length);

  for (let i = 0; i < length; i++) {
    let max = 0;
    for (let ch = 0; ch < peaks.length; ch++) {
      const val = peaks[ch][i];
      if (val > max) max = val;
    }
    mono[i] = max;
  }

  return mono;
}

/**
 * Resample peaks array to a different size using linear interpolation
 */
function resamplePeaks(peaks: number[], targetSize: number): number[] {
  if (peaks.length === 0) return generatePlaceholderPeaks(targetSize);
  if (peaks.length === targetSize) return peaks;

  const result: number[] = [];
  const ratio = peaks.length / targetSize;

  for (let i = 0; i < targetSize; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, peaks.length - 1);
    const t = srcIndex - srcIndexFloor;

    // Linear interpolation
    result.push(peaks[srcIndexFloor] * (1 - t) + peaks[srcIndexCeil] * t);
  }

  return result;
}

/**
 * Normalize peaks to 0-1 range
 */
function normalizePeaks(peaks: number[]): number[] {
  const maxPeak = Math.max(...peaks, 0.001);
  if (maxPeak <= 1.0) return peaks;
  return peaks.map((p) => p / maxPeak);
}

/**
 * Generate placeholder peaks for when audio can't be loaded
 */
function generatePlaceholderPeaks(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / count;
    const wave1 = Math.sin(t * Math.PI * 4) * 0.3;
    const wave2 = Math.sin(t * Math.PI * 8) * 0.2;
    const wave3 = Math.sin(t * Math.PI * 16) * 0.1;
    return Math.max(0.1, Math.min(1, 0.5 + wave1 + wave2 + wave3));
  });
}

/**
 * Generate waveform data from an audio/video source
 *
 * Uses neko-engine's audios:waveform for full-quality analysis.
 * The engine returns peaks at 100 peaks/second, which are then
 * resampled to the requested number of samples.
 *
 * @param src Original file path
 * @param options Generation options
 * @param options.samples Number of peaks to generate
 * @param options.channel Audio channel to analyze (0 = left, 1 = right, undefined = mono mix)
 */
export async function generateWaveform(
  src: string,
  options: {
    samples?: number;
    channel?: number;
  } = {},
): Promise<WaveformData> {
  const { samples = 200, channel } = options;

  try {
    const engineData = await fetchEngineWaveform(src);

    let monoPeaks: number[];
    if (channel !== undefined && channel < engineData.peaks.length) {
      // Use specific channel
      monoPeaks = engineData.peaks[channel];
    } else {
      // Mix all channels to mono
      monoPeaks = mixToMono(engineData.peaks);
    }

    // Resample to requested number of samples and normalize
    const resampled = resamplePeaks(monoPeaks, samples);
    const normalized = normalizePeaks(resampled);

    return {
      peaks: normalized,
      duration: engineData.duration,
      sampleRate: engineData.sampleRate,
    };
  } catch (error) {
    logger.error('Failed to generate waveform via engine:', error);
    return {
      peaks: generatePlaceholderPeaks(samples),
      duration: 0,
      sampleRate: 44100,
    };
  }
}

/**
 * Generate waveform for a specific time range
 */
export async function generateWaveformRange(
  src: string,
  startTime: number,
  endTime: number,
  samples: number = 100,
): Promise<number[]> {
  try {
    const engineData = await fetchEngineWaveform(src);

    if (engineData.duration === 0) {
      return generatePlaceholderPeaks(samples);
    }

    const monoPeaks = mixToMono(engineData.peaks);

    // Extract the time range from the full peaks array
    const startIndex = Math.floor((startTime / engineData.duration) * monoPeaks.length);
    const endIndex = Math.ceil((endTime / engineData.duration) * monoPeaks.length);

    const extracted = monoPeaks.slice(
      Math.max(0, startIndex),
      Math.min(monoPeaks.length, endIndex),
    );

    if (extracted.length === 0) {
      return generatePlaceholderPeaks(samples);
    }

    return normalizePeaks(resamplePeaks(extracted, samples));
  } catch (error) {
    logger.error('Failed to generate waveform range:', error);
    return generatePlaceholderPeaks(samples);
  }
}

/**
 * Clear waveform cache
 */
export function clearWaveformCache(): void {
  waveformCache.clear();
}

/**
 * Clear waveform cache for a specific file
 */
export function clearWaveformCacheForFile(src: string): void {
  waveformCache.delete(src);
}

/**
 * Get cache statistics
 */
export function getWaveformCacheStats(): { size: number; keys: string[] } {
  return {
    size: waveformCache.size,
    keys: Array.from(waveformCache.keys()),
  };
}

/**
 * Viewport for waveform generation
 */
export interface WaveformViewport {
  startTime: number;
  endTime: number;
  pixelsPerSecond: number;
}

/**
 * Generate waveform for a specific viewport
 * Optimized for timeline display with viewport-aware loading
 */
export async function generateWaveformForViewport(
  src: string,
  viewport: WaveformViewport,
): Promise<WaveformData> {
  const { startTime, endTime, pixelsPerSecond } = viewport;
  const duration = endTime - startTime;

  // Calculate number of samples based on viewport width
  const viewportWidth = duration * pixelsPerSecond;
  const samples = Math.max(50, Math.min(500, Math.floor(viewportWidth / 4)));

  const peaks = await generateWaveformRange(src, startTime, endTime, samples);

  return {
    peaks,
    duration,
    sampleRate: 44100,
  };
}

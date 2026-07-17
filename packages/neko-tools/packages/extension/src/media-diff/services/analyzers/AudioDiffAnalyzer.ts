/**
 * AudioDiffAnalyzer - Audio Diff Analyzer
 *
 * Delegates audio comparison to neko-engine's native audios:diff action.
 * Engine performs: FFmpeg decode → 48kHz mono PCM → SNR + diff regions.
 * This analyzer converts EngineDiffResult → Protocol AudioDiffDetails.
 */

import type {
  DiffOptions,
  DiffResult,
  AudioDiffDetails,
  EngineAudioDiffRegion,
} from '@neko/shared';
import type { SilenceAnalysis } from '@neko/neko-client/engine/types';
import type { IEngineMediaService } from '../../../contracts/IEngineMediaService';
import type { ITempFileService } from '../../../contracts/ITempFileService';
import { getLogger } from '../../../utils/logger';
import { TempFileBackedMediaDiffAnalyzer } from './TempFileBackedMediaDiffAnalyzer';

const logger = getLogger('AudioDiffAnalyzer');

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];

export class AudioDiffAnalyzer extends TempFileBackedMediaDiffAnalyzer {
  readonly mediaType = 'audio' as const;

  constructor(
    private readonly engineMediaService: IEngineMediaService,
    tempFileService: ITempFileService,
  ) {
    super(AUDIO_EXTENSIONS, tempFileService);
  }

  async analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult> {
    this.createAbortController();
    await this.waitForPendingCleanup();

    // Use local array to avoid race conditions between concurrent calls
    const localTempFiles: string[] = [];

    try {
      // Prefer original file paths when available (local comparison)
      // to avoid Buffer → temp file round-trip and extension mismatch issues
      let currentPath: string;
      let previousPath: string;
      if (options?.currentPath && options?.previousPath) {
        currentPath = options.currentPath;
        previousPath = options.previousPath;
      } else {
        const ext = options?.fileExtension ?? '.mp3';
        [currentPath, previousPath] = await this.writeTempFiles(
          'audio-diff',
          current,
          previous,
          ext,
          localTempFiles,
        );
      }
      this.throwIfAborted();

      // Step 1: Quick probe to get durations for smart range selection
      const probeA = await this.engineMediaService.probe('audios', currentPath);
      const probeB = await this.engineMediaService.probe('audios', previousPath);
      const probeDurA = probeA?.duration ?? 0;
      const probeDurB = probeB?.duration ?? 0;

      // Step 2: Smart range selection
      // - If durations differ significantly, only compare the overlapping range
      // - This avoids processing the entire long audio when comparing 120s vs 5s
      const minDur = Math.min(probeDurA, probeDurB);
      const maxDur = Math.max(probeDurA, probeDurB);
      const durRatio = maxDur > 0 ? minDur / maxDur : 1;

      const diffOptions: { startTime?: number; endTime?: number } = {};

      // User-specified time range takes priority over auto-detection
      if (options?.startTime !== undefined || options?.endTime !== undefined) {
        if (options.startTime !== undefined) diffOptions.startTime = options.startTime;
        if (options.endTime !== undefined) diffOptions.endTime = options.endTime;
        logger.debug(
          `User-specified time range: ${diffOptions.startTime ?? 0}s - ${diffOptions.endTime ?? 'end'}s`,
        );
      } else if (durRatio < 0.8 && minDur > 0) {
        // Auto-detect: if duration difference > 20%, limit comparison to shorter audio's length
        diffOptions.endTime = minDur;
        logger.debug(
          `Duration mismatch detected (${probeDurA.toFixed(1)}s vs ${probeDurB.toFixed(1)}s), limiting comparison to ${minDur.toFixed(1)}s`,
        );
      }

      const engineResult = await this.engineMediaService.diff(
        'audios',
        currentPath,
        previousPath,
        diffOptions,
      );

      this.throwIfAborted();

      if (!engineResult) {
        throw new Error('Engine audio diff unavailable');
      }

      // Step 3: Parallel silence detection (non-blocking, graceful fallback)
      const [silenceA, silenceB]: Array<SilenceAnalysis | null> = await Promise.all([
        this.engineMediaService.detectSilence(currentPath).catch((): null => null),
        this.engineMediaService.detectSilence(previousPath).catch((): null => null),
      ]);

      this.throwIfAborted();

      // Convert Engine types → Protocol types
      const audioDiff = engineResult.audioDiff;
      const details: AudioDiffDetails = {
        duration: {
          current: audioDiff?.durationA ?? 0,
          previous: audioDiff?.durationB ?? 0,
        },
        sampleRate: {
          current: audioDiff?.compareSampleRate ?? 0,
          previous: audioDiff?.compareSampleRate ?? 0,
        },
        channels: { current: 1, previous: 1 }, // Engine compares as mono
        waveformSimilarity: this.snrToSimilarity(audioDiff?.snr ?? 0),
        spectralDifference: (audioDiff?.diffPercent ?? 0) / 100,
        diffRegions: audioDiff?.diffRegions?.map((r: EngineAudioDiffRegion) => ({
          start: r.start,
          end: r.end,
          snr: r.snr,
        })),
        silenceRegions:
          silenceA || silenceB
            ? {
                current: silenceA?.regions?.map((r) => ({ start: r.start, end: r.end })) ?? [],
                previous: silenceB?.regions?.map((r) => ({ start: r.start, end: r.end })) ?? [],
              }
            : undefined,
      };

      // Compute overall similarity from SNR
      let similarity = details.waveformSimilarity;

      // Penalize for duration difference
      const durationA = audioDiff?.durationA ?? 0;
      const durationB = audioDiff?.durationB ?? 0;
      const durationDiff = Math.abs(durationA - durationB);
      const maxDuration = Math.max(durationA, durationB);
      if (maxDuration > 0) {
        similarity *= 1 - (durationDiff / maxDuration) * 0.5;
      }

      return {
        mediaType: 'audio',
        similarity: Math.max(0, Math.min(1, similarity)),
        details,
        visualization: {
          currentWaveform: audioDiff?.waveformPeaksA ?? [],
          previousWaveform: audioDiff?.waveformPeaksB ?? [],
        },
      };
    } finally {
      await this.cleanupTempFiles(localTempFiles);
    }
  }

  /**
   * Convert SNR (dB) to similarity score (0-1).
   * SNR=Infinity → identical (1.0), SNR=0 → completely different (0.0)
   */
  private snrToSimilarity(snr: number): number {
    if (!isFinite(snr)) return 1.0;
    if (snr <= 0) return 0;
    // 60dB+ is essentially identical, 0dB is completely different
    return Math.min(1, snr / 60);
  }
}

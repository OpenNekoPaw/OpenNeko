import {
  CUT_THUMBNAIL_DENSITIES,
  CUT_THUMBNAIL_TILE_HEIGHT,
  CUT_THUMBNAIL_TILE_WIDTH,
  CutMediaCorruptionError,
} from '@neko-cut/domain';
import type {
  CutRepresentationFailureScope,
  AudioWaveformPort,
  CutClipRepresentationRequest,
  CutClipRepresentationResult,
  CutRuntimeMediaSource,
  CutThumbnailDensity,
  FrameCapturePort,
  TimelineClipView,
  TimelineView,
} from '@neko-cut/domain';

const MAX_REQUESTS = 24;
const MAX_PEAKS_PER_SECOND = 100;
const MAX_CONCURRENT_REPRESENTATIONS = 4;

export interface ClipRepresentationPorts extends FrameCapturePort, AudioWaveformPort {}

export function readClipRepresentationRequests(
  value: unknown,
): readonly CutClipRepresentationRequest[] {
  if (!Array.isArray(value) || value.length > MAX_REQUESTS) {
    throw new Error(`Cut representation request must contain at most ${MAX_REQUESTS} items.`);
  }
  return value.map((candidate): CutClipRepresentationRequest => {
    if (!isRecord(candidate) || typeof candidate['clipId'] !== 'string') {
      throw new Error('Cut representation request requires a clipId.');
    }
    if (
      candidate['kind'] === 'thumbnail' &&
      isThumbnailDensity(candidate['density']) &&
      Number.isSafeInteger(candidate['tileIndex']) &&
      typeof candidate['tileIndex'] === 'number' &&
      candidate['tileIndex'] >= 0
    ) {
      return {
        clipId: candidate['clipId'],
        kind: 'thumbnail',
        density: candidate['density'],
        tileIndex: candidate['tileIndex'],
      };
    }
    if (
      candidate['kind'] === 'waveform' &&
      Number.isInteger(candidate['peaksPerSecond']) &&
      typeof candidate['peaksPerSecond'] === 'number' &&
      candidate['peaksPerSecond'] >= 1 &&
      candidate['peaksPerSecond'] <= MAX_PEAKS_PER_SECOND
    ) {
      return {
        clipId: candidate['clipId'],
        kind: 'waveform',
        peaksPerSecond: candidate['peaksPerSecond'],
      };
    }
    throw new Error('Cut representation request has invalid bounded options.');
  });
}

export async function generateClipRepresentations(input: {
  readonly view: TimelineView;
  readonly requests: readonly CutClipRepresentationRequest[];
  readonly ports: ClipRepresentationPorts;
  readonly resolveSource: (targetUrl: string) => Promise<CutRuntimeMediaSource>;
  readonly signal?: AbortSignal;
}): Promise<readonly CutClipRepresentationResult[]> {
  const resolvedSources = new Map<string, Promise<CutRuntimeMediaSource>>();
  const resolveSource = (targetUrl: string): Promise<CutRuntimeMediaSource> => {
    const existing = resolvedSources.get(targetUrl);
    if (existing) return existing;
    const pending = input.resolveSource(targetUrl);
    resolvedSources.set(targetUrl, pending);
    return pending;
  };
  return mapWithConcurrency(
    input.requests,
    MAX_CONCURRENT_REPRESENTATIONS,
    async (request): Promise<CutClipRepresentationResult> => {
      const located = findClip(input.view, request.clipId);
      if (!located) {
        return unavailable(request, `Clip ${request.clipId} is unavailable.`);
      }
      if (
        (request.kind === 'thumbnail' && located.trackKind !== 'Video') ||
        (request.kind === 'waveform' && located.trackKind !== 'Audio')
      ) {
        return unavailable(
          request,
          `${request.kind} is incompatible with a ${located.trackKind} Clip.`,
        );
      }
      try {
        const source = await resolveSource(located.clip.targetUrl);
        if (request.kind === 'waveform') {
          const waveform = await input.ports.generateWaveform(
            source,
            { peaksPerSecond: request.peaksPerSecond },
            input.signal,
          );
          const sliced = sliceWaveform(
            waveform,
            located.clip.sourceStartSeconds,
            located.clip.durationSeconds,
          );
          if (sliced.partial && sliced.peaks.length === 0) {
            return unavailable(request, sliced.partial.message, sliced.partial.failureScope);
          }
          if (sliced.partial) {
            return {
              clipId: request.clipId,
              kind: 'waveform',
              status: 'partial',
              peaksPerSecond: request.peaksPerSecond,
              waveform: {
                ...sliced,
                partial: sliced.partial,
              },
            };
          }
          return {
            clipId: request.clipId,
            kind: 'waveform',
            status: 'ready',
            peaksPerSecond: request.peaksPerSecond,
            waveform: sliced,
          };
        }
        const sourceTimeSeconds = resolveTileSourceTime(located.clip, request);
        if (sourceTimeSeconds === undefined) {
          return unavailable(
            request,
            `Thumbnail tile ${request.tileIndex} does not intersect Clip ${request.clipId}.`,
          );
        }
        const frame = await input.ports.captureFrame(
          source,
          sourceTimeSeconds,
          { width: CUT_THUMBNAIL_TILE_WIDTH, height: CUT_THUMBNAIL_TILE_HEIGHT },
          input.signal,
        );
        return {
          clipId: request.clipId,
          kind: 'thumbnail',
          status: 'ready',
          density: request.density,
          tileIndex: request.tileIndex,
          sourceTimeSeconds,
          dataUrl: frame.dataUrl,
        };
      } catch (error) {
        if (input.signal?.aborted) throw error;
        return unavailable(
          request,
          error instanceof Error ? error.message : String(error),
          error instanceof CutMediaCorruptionError ? error.scope : undefined,
        );
      }
    },
  );
}

function resolveTileSourceTime(
  clip: TimelineClipView,
  request: Extract<CutClipRepresentationRequest, { readonly kind: 'thumbnail' }>,
): number | undefined {
  const tileDurationSeconds = CUT_THUMBNAIL_TILE_WIDTH / request.density;
  const tileStartSeconds = request.tileIndex * tileDurationSeconds;
  const intersectionStart = Math.max(tileStartSeconds, clip.startSeconds);
  const intersectionEnd = Math.min(
    tileStartSeconds + tileDurationSeconds,
    clip.startSeconds + clip.durationSeconds,
  );
  if (intersectionEnd <= intersectionStart) return undefined;
  const clipTimeSeconds = (intersectionStart + intersectionEnd) / 2 - clip.startSeconds;
  return clip.sourceStartSeconds + clipTimeSeconds * clip.playbackRate;
}

function sliceWaveform(
  waveform: Awaited<ReturnType<AudioWaveformPort['generateWaveform']>>,
  sourceStartSeconds: number,
  durationSeconds: number,
) {
  const startIndex = Math.max(0, Math.floor(sourceStartSeconds * waveform.peaksPerSecond));
  const endIndex = Math.max(
    startIndex,
    Math.ceil((sourceStartSeconds + durationSeconds) * waveform.peaksPerSecond),
  );
  return {
    peaks: waveform.peaks.slice(startIndex, endIndex),
    durationSeconds,
    peaksPerSecond: waveform.peaksPerSecond,
    ...(waveform.partial
      ? {
          partial: {
            availableDurationSeconds: Math.max(
              0,
              Math.min(
                durationSeconds,
                waveform.partial.availableDurationSeconds - sourceStartSeconds,
              ),
            ),
            failureScope: waveform.partial.failureScope,
            message: waveform.partial.message,
          },
        }
      : {}),
  };
}

function findClip(view: TimelineView, clipId: string) {
  for (const track of view.tracks) {
    const clip = track.items.find(
      (item): item is TimelineClipView => item.kind === 'clip' && item.clipId === clipId,
    );
    if (clip) return { clip, trackKind: track.kind };
  }
  return undefined;
}

function unavailable(
  request: CutClipRepresentationRequest,
  message: string,
  failureScope?: CutRepresentationFailureScope,
): CutClipRepresentationResult {
  return request.kind === 'thumbnail'
    ? {
        clipId: request.clipId,
        kind: request.kind,
        status: 'unavailable',
        density: request.density,
        tileIndex: request.tileIndex,
        message,
        ...(failureScope ? { failureScope } : {}),
      }
    : {
        clipId: request.clipId,
        kind: request.kind,
        status: 'unavailable',
        peaksPerSecond: request.peaksPerSecond,
        message,
        ...(failureScope ? { failureScope } : {}),
      };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value === undefined) throw new Error(`Missing representation request at ${index}.`);
      results[index] = await map(value);
    }
  });
  await Promise.all(workers);
  return results;
}

function isThumbnailDensity(value: unknown): value is CutThumbnailDensity {
  return CUT_THUMBNAIL_DENSITIES.some((density) => density === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

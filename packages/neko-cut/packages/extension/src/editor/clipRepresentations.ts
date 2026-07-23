import type {
  AudioWaveformPort,
  CutClipRepresentationRequest,
  CutClipRepresentationResult,
  CutRuntimeMediaSource,
  FrameCapturePort,
  TimelineClipView,
  TimelineView,
} from '@neko-cut/domain';

const MAX_REQUESTS = 24;
const MAX_THUMBNAILS = 8;
const MAX_PEAKS_PER_SECOND = 100;

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
      Number.isInteger(candidate['sampleCount']) &&
      typeof candidate['sampleCount'] === 'number' &&
      candidate['sampleCount'] >= 1 &&
      candidate['sampleCount'] <= MAX_THUMBNAILS
    ) {
      return {
        clipId: candidate['clipId'],
        kind: 'thumbnail',
        sampleCount: candidate['sampleCount'],
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
  return Promise.all(
    input.requests.map(async (request): Promise<CutClipRepresentationResult> => {
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
        const source = await input.resolveSource(located.clip.targetUrl);
        if (request.kind === 'waveform') {
          const waveform = await input.ports.generateWaveform(
            source,
            { peaksPerSecond: request.peaksPerSecond },
            input.signal,
          );
          return {
            clipId: request.clipId,
            kind: 'waveform',
            status: 'ready',
            waveform: sliceWaveform(
              waveform,
              located.clip.sourceStartSeconds,
              located.clip.durationSeconds,
            ),
          };
        }
        const thumbnails = [];
        for (let index = 0; index < request.sampleCount; index += 1) {
          const sourceTimeSeconds =
            located.clip.sourceStartSeconds +
            (located.clip.durationSeconds * (index + 0.5)) / request.sampleCount;
          const frame = await input.ports.captureFrame(
            source,
            sourceTimeSeconds,
            { width: 160, height: 90 },
            input.signal,
          );
          thumbnails.push({ sourceTimeSeconds, dataUrl: frame.dataUrl });
        }
        return {
          clipId: request.clipId,
          kind: 'thumbnail',
          status: 'ready',
          thumbnails,
        };
      } catch (error) {
        return unavailable(request, error instanceof Error ? error.message : String(error));
      }
    }),
  );
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
): CutClipRepresentationResult {
  return {
    clipId: request.clipId,
    kind: request.kind,
    status: 'unavailable',
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

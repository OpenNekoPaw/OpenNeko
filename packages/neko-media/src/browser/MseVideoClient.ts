import type { MseVideoDescriptor } from '../contracts';

export interface MseVideoClientOptions {
  readonly video: HTMLVideoElement;
  readonly descriptor: MseVideoDescriptor;
  readonly playbackRate: number;
  readonly onEnded?: () => void;
  readonly onError?: (error: Error) => void;
}

export class MseVideoClient {
  private readonly abortController = new AbortController();
  private objectUrl: string | undefined;
  private disposed = false;

  constructor(private readonly options: MseVideoClientOptions) {}

  async connect(): Promise<void> {
    if (this.disposed) throw new Error('MSE video client is disposed.');
    const { descriptor, video } = this.options;
    validateDescriptor(descriptor);
    if (!MediaSource.isTypeSupported(descriptor.mimeType)) {
      throw new Error(`VS Code Webview does not support ${descriptor.mimeType}.`);
    }
    const mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(mediaSource);
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.playbackRate = this.options.playbackRate;
    video.addEventListener('ended', this.handleEnded);
    video.addEventListener('error', this.handleVideoError);
    video.src = this.objectUrl;
    video.load();
    await waitForEvent(mediaSource, 'sourceopen', this.abortController.signal);
    const sourceBuffer = mediaSource.addSourceBuffer(descriptor.mimeType);
    if (descriptor.initSegmentUrl) {
      await appendUrl(sourceBuffer, descriptor.initSegmentUrl, this.abortController.signal);
    }
    for (const segment of descriptor.segments) {
      await appendUrl(sourceBuffer, segment.url, this.abortController.signal);
    }
    if (mediaSource.readyState === 'open' && !sourceBuffer.updating) {
      mediaSource.endOfStream();
    }
    video.currentTime = descriptor.mediaTimeOriginSeconds;
  }

  async play(): Promise<void> {
    if (this.disposed) throw new Error('MSE video client is disposed.');
    await this.options.video.play();
  }

  pause(): void {
    if (this.disposed) throw new Error('MSE video client is disposed.');
    this.options.video.pause();
  }

  seek(timeSeconds: number): void {
    if (this.disposed) throw new Error('MSE video client is disposed.');
    if (!this.canSeek(timeSeconds)) {
      throw new Error('MSE video seek time is outside the prepared interval.');
    }
    this.options.video.currentTime = this.options.descriptor.mediaTimeOriginSeconds + timeSeconds;
  }

  canSeek(timeSeconds: number): boolean {
    return (
      Number.isFinite(timeSeconds) &&
      timeSeconds >= 0 &&
      timeSeconds <= this.options.descriptor.durationSeconds
    );
  }

  async primeForSynchronizedStart(): Promise<void> {
    if (this.disposed) throw new Error('MSE video client is disposed.');
    const { descriptor, video } = this.options;
    await video.play();
    video.pause();
    video.currentTime = descriptor.mediaTimeOriginSeconds;
  }

  get currentTimeSeconds(): number {
    return Math.max(
      0,
      this.options.video.currentTime - this.options.descriptor.mediaTimeOriginSeconds,
    );
  }

  set playbackRate(rate: number) {
    this.options.video.playbackRate = rate;
  }

  get playbackRate(): number {
    return this.options.video.playbackRate;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort(new Error('MSE video client was stopped.'));
    const { video } = this.options;
    video.removeEventListener('ended', this.handleEnded);
    video.removeEventListener('error', this.handleVideoError);
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
  }

  private readonly handleEnded = (): void => {
    this.options.onEnded?.();
  };

  private readonly handleVideoError = (): void => {
    const mediaError = this.options.video.error;
    this.options.onError?.(
      new Error(`Cut video element failed${mediaError ? ` (code ${mediaError.code})` : ''}.`),
    );
  };
}

async function appendUrl(
  sourceBuffer: SourceBuffer,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Cut media segment request failed with ${response.status}.`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('Cut media segment is empty.');
  sourceBuffer.appendBuffer(bytes);
  await waitForEvent(sourceBuffer, 'updateend', signal);
}

function waitForEvent(target: EventTarget, eventName: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<void>((resolve, reject) => {
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error(`Cut MSE ${eventName} operation failed.`));
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = (): void => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function validateDescriptor(descriptor: MseVideoDescriptor): void {
  if (descriptor.version !== 1 || descriptor.transport !== 'http-mse') {
    throw new Error('Unsupported Cut MSE descriptor version.');
  }
  if (!descriptor.mimeType.startsWith('video/')) {
    throw new Error('Cut MSE descriptor requires a video MIME type.');
  }
  if (descriptor.segments.length === 0) {
    throw new Error('Cut MSE descriptor contains no media segments.');
  }
  descriptor.segments.forEach((segment, index) => {
    if (
      segment.index !== index ||
      !Number.isFinite(segment.startTimeSeconds) ||
      !Number.isFinite(segment.endTimeSeconds) ||
      segment.endTimeSeconds <= segment.startTimeSeconds ||
      !isLoopbackUrl(segment.url)
    ) {
      throw new Error(`Invalid Cut MSE segment descriptor at index ${index}.`);
    }
  });
  if (descriptor.initSegmentUrl && !isLoopbackUrl(descriptor.initSegmentUrl)) {
    throw new Error('Cut MSE initialization segment must use loopback HTTP.');
  }
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Cut MSE operation aborted.');
}

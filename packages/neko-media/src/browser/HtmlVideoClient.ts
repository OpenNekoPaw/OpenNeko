import { isMediaResourceUrl } from '../contracts';

export interface HtmlVideoClientDescriptor {
  readonly version: 1;
  readonly url: string;
  readonly mimeType: string;
  readonly mediaTimeOriginSeconds: number;
  readonly durationSeconds: number;
}

export interface HtmlVideoClientOptions {
  readonly video: HTMLVideoElement;
  readonly descriptor: HtmlVideoClientDescriptor;
  readonly playbackRate: number;
  readonly onEnded?: () => void;
  readonly onError?: (error: Error) => void;
}

export class HtmlVideoClient {
  private readonly abortController = new AbortController();
  private disposed = false;

  constructor(private readonly options: HtmlVideoClientOptions) {}

  async connect(): Promise<void> {
    if (this.disposed) throw new Error('HTML video client is disposed.');
    const { descriptor, video } = this.options;
    validateDescriptor(descriptor);
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.playbackRate = this.options.playbackRate;
    video.addEventListener('ended', this.handleEnded);
    video.addEventListener('error', this.handleVideoError);
    video.src = descriptor.url;
    video.load();
    await waitForReadyState(video, 1, 'loadedmetadata', this.signal);
    if (Number.isFinite(video.duration) && descriptor.mediaTimeOriginSeconds > video.duration) {
      throw new Error('Cut HTML video origin exceeds the media duration.');
    }
    await seekTo(video, descriptor.mediaTimeOriginSeconds, this.signal);
  }

  async play(): Promise<void> {
    this.assertUsable();
    await this.options.video.play();
  }

  pause(): void {
    this.assertUsable();
    this.options.video.pause();
  }

  seek(timeSeconds: number): void {
    this.assertUsable();
    if (!this.canSeek(timeSeconds)) {
      throw new Error('HTML video seek time is outside the prepared interval.');
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
    this.assertUsable();
    const { descriptor, video } = this.options;
    await seekTo(video, descriptor.mediaTimeOriginSeconds, this.signal);
    await video.play();
    try {
      await waitForPresentedFrame(video, this.signal);
    } finally {
      video.pause();
    }
    await presentExactFrame(video, descriptor.mediaTimeOriginSeconds, this.signal);
  }

  get currentTimeSeconds(): number {
    return Math.max(
      0,
      this.options.video.currentTime - this.options.descriptor.mediaTimeOriginSeconds,
    );
  }

  set playbackRate(rate: number) {
    this.assertUsable();
    this.options.video.playbackRate = rate;
  }

  get playbackRate(): number {
    return this.options.video.playbackRate;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort(new Error('HTML video client was stopped.'));
    const { video } = this.options;
    video.removeEventListener('ended', this.handleEnded);
    video.removeEventListener('error', this.handleVideoError);
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  private get signal(): AbortSignal {
    return this.abortController.signal;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('HTML video client is disposed.');
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

async function seekTo(
  video: HTMLVideoElement,
  timeSeconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) <= Number.EPSILON) {
    await waitForReadyState(video, 2, 'loadeddata', signal);
    return;
  }
  const seeked = waitForEvent(video, 'seeked', signal);
  video.currentTime = timeSeconds;
  await seeked;
  await waitForReadyState(video, 2, 'loadeddata', signal);
}

async function presentExactFrame(
  video: HTMLVideoElement,
  timeSeconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) <= Number.EPSILON) return;
  if (typeof video.requestVideoFrameCallback !== 'function') {
    await seekTo(video, timeSeconds, signal);
    return;
  }
  const presented = waitForPresentedFrame(video, signal);
  await seekTo(video, timeSeconds, signal);
  await presented;
}

function waitForReadyState(
  video: HTMLVideoElement,
  readyState: number,
  eventName: string,
  signal: AbortSignal,
): Promise<void> {
  return video.readyState >= readyState
    ? Promise.resolve()
    : waitForEvent(video, eventName, signal);
}

function waitForPresentedFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (typeof video.requestVideoFrameCallback !== 'function') {
    return waitForEvent(video, 'timeupdate', signal);
  }
  return new Promise<void>((resolve, reject) => {
    const onFrame = (): void => {
      cleanup();
      resolve();
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = (): void => {
      if (typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(callbackId);
      }
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const callbackId = video.requestVideoFrameCallback(onFrame);
  });
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
      reject(new Error(`Cut HTML video ${eventName} operation failed.`));
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

function validateDescriptor(descriptor: HtmlVideoClientDescriptor): void {
  if (descriptor.version !== 1) {
    throw new Error('Unsupported Cut HTML video descriptor version.');
  }
  if (!isMediaResourceUrl(descriptor.url)) {
    throw new Error('Invalid Cut HTML video descriptor resource URL.');
  }
  if (!descriptor.mimeType.startsWith('video/')) {
    throw new Error('Cut HTML video descriptor requires a video MIME type.');
  }
  if (
    !Number.isFinite(descriptor.mediaTimeOriginSeconds) ||
    descriptor.mediaTimeOriginSeconds < 0 ||
    !Number.isFinite(descriptor.durationSeconds) ||
    descriptor.durationSeconds <= 0
  ) {
    throw new Error('Invalid Cut HTML video descriptor.');
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Cut HTML video operation aborted.');
}

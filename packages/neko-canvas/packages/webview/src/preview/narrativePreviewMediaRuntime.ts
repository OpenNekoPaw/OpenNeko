import { formatMediaTime, type HtmlVideoDescriptor, type PcmStreamDescriptor } from '@neko/media';
import { PcmAudioClient } from '@neko/media/browser';

type PreviewMediaType = 'audio' | 'video';
type RuntimeEventType = 'ready' | 'timeUpdate' | 'ended' | 'error';

interface PreviewMediaLabels {
  readonly play?: string;
  readonly pause?: string;
  readonly loading?: string;
  readonly preparing?: string;
  readonly probeTimeout?: string;
  readonly streamTimeout?: string;
}

interface PreviewMediaMountRequest {
  readonly surfaceId: string;
  readonly container: HTMLElement;
  readonly mediaType: PreviewMediaType;
  readonly label?: string;
  readonly startTime?: number;
  readonly duration?: number;
  readonly posterUrl?: string;
  readonly labels?: PreviewMediaLabels;
}

interface PreviewMediaStartRequest {
  readonly surfaceId: string;
  readonly assetPath?: string;
  readonly resourceRef?: unknown;
  readonly documentResourceRef?: unknown;
  readonly mediaType: PreviewMediaType;
  readonly startTime?: number;
  readonly autoPlay?: boolean;
}

interface PreviewMediaRuntimeApi {
  mount(request: PreviewMediaMountRequest): void;
  start(request: PreviewMediaStartRequest): void;
  pause(surfaceId: string): void;
  resume(surfaceId: string): void;
  seek(surfaceId: string, time: number): void;
  stop(surfaceId: string): void;
  dispose(surfaceId: string): void;
  handleHostMessage(message: unknown): void;
}

interface NormalizedLabels {
  readonly play: string;
  readonly pause: string;
  readonly loading: string;
  readonly preparing: string;
  readonly probeTimeout: string;
  readonly streamTimeout: string;
}

interface PlayerState {
  readonly surfaceId: string;
  readonly mediaType: PreviewMediaType;
  readonly container: HTMLElement;
  readonly root: HTMLElement;
  readonly video?: HTMLVideoElement;
  readonly audioVisualization?: HTMLElement;
  readonly progress: HTMLInputElement;
  readonly time: HTMLElement;
  readonly playButton: HTMLButtonElement;
  readonly message: HTMLElement;
  readonly labels: NormalizedLabels;
  lastStartRequest?: PreviewMediaStartRequest;
  probeMediaInfo?: Record<string, unknown>;
  assetPath?: string;
  resourceRef?: unknown;
  documentResourceRef?: unknown;
  audioContext?: AudioContext;
  audioClient?: PcmAudioClient;
  animationFrameId?: number;
  timeoutId?: number;
  pendingStage?: 'probe' | 'stream';
  generation: number;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isPlaying: boolean;
  shouldPlayWhenReady: boolean;
  waitingForStream: boolean;
}

declare global {
  interface Window {
    __nekoNarrativePreviewPostMessage?: (message: Record<string, unknown>) => void;
    __nekoNarrativePreviewMediaRuntime?: PreviewMediaRuntimeApi;
  }
}

const DEFAULT_DURATION_SECONDS = 1.2;
const DEFAULT_VOLUME = 0.8;
const HOST_RESPONSE_TIMEOUT_MS = 10_000;
const VIDEO_SYNC_THRESHOLD_SECONDS = 0.08;
const DEFAULT_LABELS: NormalizedLabels = {
  play: 'Play',
  pause: 'Pause',
  loading: 'Loading media stream...',
  preparing: 'Preparing media stream...',
  probeTimeout: 'Media probe timed out.',
  streamTimeout: 'Media stream timed out.',
};
const players = new Map<string, PlayerState>();

function mount(request: PreviewMediaMountRequest): void {
  dispose(request.surfaceId);
  const root = document.createElement('div');
  root.className = 'neko-preview-media-player';
  root.dataset.mediaType = request.mediaType;
  const viewport = document.createElement('div');
  viewport.className = 'neko-preview-media-viewport';
  const title = document.createElement('div');
  title.className = 'neko-preview-media-title';
  title.textContent = request.label ?? request.mediaType;
  const message = document.createElement('div');
  message.className = 'neko-preview-media-message';
  const labels = normalizeLabels(request.labels);
  message.textContent = labels.loading;
  const video = request.mediaType === 'video' ? document.createElement('video') : undefined;
  if (video) {
    video.className = 'neko-preview-video-surface';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    viewport.appendChild(video);
  }
  const audioVisualization = request.mediaType === 'audio' ? createAudioVisualization() : undefined;
  if (audioVisualization) viewport.appendChild(audioVisualization);
  if (request.posterUrl) {
    const poster = document.createElement('img');
    poster.className = 'neko-preview-media-poster';
    poster.alt = '';
    poster.src = request.posterUrl;
    viewport.appendChild(poster);
  }
  viewport.appendChild(message);
  const controls = document.createElement('div');
  controls.className = 'neko-preview-media-controls';
  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'neko-preview-media-play';
  const progress = document.createElement('input');
  progress.type = 'range';
  progress.className = 'neko-preview-media-progress';
  progress.min = '0';
  progress.step = '0.01';
  const time = document.createElement('span');
  time.className = 'neko-preview-media-time';
  controls.append(playButton, progress, time);
  root.append(title, viewport, controls);
  request.container.replaceChildren(root);
  const player: PlayerState = {
    surfaceId: request.surfaceId,
    mediaType: request.mediaType,
    container: request.container,
    root,
    ...(video ? { video } : {}),
    ...(audioVisualization ? { audioVisualization } : {}),
    progress,
    time,
    playButton,
    message,
    labels,
    generation: 0,
    currentTime: request.startTime ?? 0,
    duration: request.duration ?? DEFAULT_DURATION_SECONDS,
    playbackRate: 1,
    isPlaying: false,
    shouldPlayWhenReady: false,
    waitingForStream: true,
  };
  players.set(request.surfaceId, player);
  playButton.addEventListener('click', () => {
    activateAudioContext(player);
    if (player.isPlaying) pause(player.surfaceId);
    else resume(player.surfaceId);
  });
  progress.addEventListener('input', () => {
    player.currentTime = Number(progress.value);
    render(player);
  });
  progress.addEventListener('change', () => seek(player.surfaceId, Number(progress.value)));
  render(player);
}

function start(request: PreviewMediaStartRequest): void {
  const player = players.get(request.surfaceId);
  if (!player) return;
  activateAudioContext(player);
  player.lastStartRequest = request;
  player.probeMediaInfo = undefined;
  player.assetPath = request.assetPath;
  player.resourceRef = request.resourceRef;
  player.documentResourceRef = request.documentResourceRef;
  player.currentTime = request.startTime ?? player.currentTime;
  player.shouldPlayWhenReady = request.autoPlay === true;
  setLoading(player, 'probe');
  postHostMessage({
    type: 'media:probe',
    nodeId: player.surfaceId,
    assetPath: request.assetPath,
    resourceRef: request.resourceRef,
    documentResourceRef: request.documentResourceRef,
    mediaType: request.mediaType,
  });
}

function pause(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  player.isPlaying = false;
  player.shouldPlayWhenReady = false;
  player.video?.pause();
  void player.audioClient?.pause();
  cancelFrame(player);
  postHostMessage({ type: 'media:pause', nodeId: surfaceId });
  render(player);
}

function resume(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  activateAudioContext(player);
  player.shouldPlayWhenReady = true;
  if (player.waitingForStream) {
    render(player);
    return;
  }
  if (!player.probeMediaInfo) {
    const request = player.lastStartRequest;
    if (request) start({ ...request, autoPlay: true, startTime: player.currentTime });
    return;
  }
  if (!player.audioClient && !player.video?.src) {
    requestStream(player);
    return;
  }
  player.isPlaying = true;
  void player.audioClient?.resume();
  void player.video?.play();
  postHostMessage({ type: 'media:resume', nodeId: surfaceId });
  scheduleClock(player);
  render(player);
}

function seek(surfaceId: string, time: number): void {
  const player = players.get(surfaceId);
  if (!player) return;
  player.currentTime = clamp(time, 0, player.duration);
  teardownStreams(player);
  setLoading(player, 'stream');
  postHostMessage({
    type: 'media:seek',
    nodeId: surfaceId,
    time: player.currentTime,
    speed: player.playbackRate,
  });
  render(player);
}

function stop(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  player.isPlaying = false;
  player.shouldPlayWhenReady = false;
  teardownStreams(player);
  postHostMessage({ type: 'media:stop', nodeId: surfaceId });
  render(player);
}

function dispose(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  players.delete(surfaceId);
  teardownStreams(player);
  if (player.audioContext?.state !== 'closed') void player.audioContext?.close();
  postHostMessage({ type: 'media:stop', nodeId: surfaceId });
  player.container.replaceChildren();
}

function handleHostMessage(message: unknown): void {
  if (!isRecord(message) || typeof message['type'] !== 'string') return;
  if (message['type'] === 'media:probeResult') handleProbeResult(message);
  if (message['type'] === 'media:streamReady') void handleStreamReady(message);
}

function handleProbeResult(message: Record<string, unknown>): void {
  const player = findPlayer(message['nodeId']);
  if (!player) return;
  clearTimeoutFor(player, 'probe');
  if (message['error']) {
    showError(player, String(message['error']));
    return;
  }
  const mediaInfo = isRecord(message['mediaInfo']) ? message['mediaInfo'] : {};
  player.probeMediaInfo = mediaInfo;
  player.duration = readNumber(mediaInfo['duration']) ?? player.duration;
  player.progress.max = String(Math.max(player.duration, 0.1));
  if (player.shouldPlayWhenReady) requestStream(player);
  else {
    player.waitingForStream = false;
    player.message.textContent = '';
    player.root.dataset.state = 'ready';
    render(player);
    dispatch(player, 'ready');
  }
}

function requestStream(player: PlayerState): void {
  if (!player.probeMediaInfo) {
    showError(player, 'Media probe metadata is unavailable.');
    return;
  }
  setLoading(player, 'stream');
  postHostMessage({
    type: 'media:play',
    nodeId: player.surfaceId,
    assetPath: player.assetPath,
    resourceRef: player.resourceRef,
    documentResourceRef: player.documentResourceRef,
    mediaInfo: player.probeMediaInfo,
    mediaType: player.mediaType,
    startTime: player.currentTime,
    speed: player.playbackRate,
  });
}

async function handleStreamReady(message: Record<string, unknown>): Promise<void> {
  const player = findPlayer(message['nodeId']);
  if (!player) return;
  clearTimeoutFor(player, 'stream');
  if (message['error']) {
    showError(player, String(message['error']));
    return;
  }
  teardownStreams(player);
  const generation = player.generation;
  const videoDescriptor = readVideoDescriptor(message['video']);
  const audioDescriptor = readAudioDescriptor(message['audio']);
  player.playbackRate = readNumber(message['playbackRate']) ?? 1;
  player.currentTime = readNumber(message['startTime']) ?? player.currentTime;
  try {
    const audioClient = audioDescriptor
      ? new PcmAudioClient({
          descriptor: audioDescriptor,
          volume: DEFAULT_VOLUME,
          playbackRate: player.playbackRate,
          onError: (error) => showError(player, error.message),
        })
      : undefined;
    if (audioClient) await audioClient.connect(activateAudioContext(player));
    if (generation !== player.generation) {
      audioClient?.dispose();
      return;
    }
    player.audioClient = audioClient;
    if (player.mediaType === 'video') {
      if (!videoDescriptor || !player.video) {
        throw new Error('Narrative video descriptor is unavailable.');
      }
      player.video.playbackRate = player.playbackRate;
      player.video.src = videoDescriptor.url;
      player.video.load();
      await waitForMetadata(player.video);
      player.video.currentTime = player.currentTime;
    }
    player.waitingForStream = false;
    player.message.textContent = '';
    player.root.dataset.state = 'playing';
    player.isPlaying = player.shouldPlayWhenReady;
    if (player.isPlaying) {
      await player.video?.play();
      scheduleClock(player);
    } else {
      void player.audioClient?.pause();
    }
    render(player);
    dispatch(player, 'ready');
  } catch (error) {
    showError(player, error instanceof Error ? error.message : String(error));
  }
}

function scheduleClock(player: PlayerState): void {
  cancelFrame(player);
  const tick = (): void => {
    if (!player.isPlaying) return;
    const audioClient = player.audioClient;
    const nextTime = audioClient?.isClockReady
      ? audioClient.getCurrentTime()
      : (player.video?.currentTime ?? player.currentTime);
    if (
      player.video &&
      audioClient?.isClockReady &&
      Math.abs(player.video.currentTime - nextTime) > VIDEO_SYNC_THRESHOLD_SECONDS
    ) {
      player.video.currentTime = nextTime;
    }
    player.currentTime = nextTime;
    if (nextTime >= player.duration) {
      player.currentTime = player.duration;
      player.isPlaying = false;
      render(player);
      dispatch(player, 'ended');
      postHostMessage({ type: 'media:stop', nodeId: player.surfaceId });
      return;
    }
    render(player);
    player.animationFrameId = requestAnimationFrame(tick);
  };
  player.animationFrameId = requestAnimationFrame(tick);
}

function activateAudioContext(player: PlayerState): AudioContext {
  let context = player.audioContext;
  if (!context || context.state === 'closed') {
    context = new AudioContext({ sampleRate: 48_000 });
    player.audioContext = context;
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function teardownStreams(player: PlayerState): void {
  player.generation += 1;
  clearTimeoutFor(player);
  cancelFrame(player);
  player.audioClient?.dispose();
  player.audioClient = undefined;
  if (player.video) {
    player.video.pause();
    player.video.removeAttribute('src');
    player.video.load();
  }
}

function render(player: PlayerState): void {
  player.playButton.textContent = player.isPlaying ? player.labels.pause : player.labels.play;
  player.playButton.disabled = player.waitingForStream;
  player.progress.max = String(Math.max(player.duration, 0.1));
  player.progress.value = String(clamp(player.currentTime, 0, player.duration));
  player.time.textContent = `${formatMediaTime(player.currentTime)} / ${formatMediaTime(player.duration)}`;
  dispatch(player, 'timeUpdate');
}

function setLoading(player: PlayerState, stage: 'probe' | 'stream'): void {
  clearTimeoutFor(player);
  player.pendingStage = stage;
  player.waitingForStream = true;
  player.message.textContent = player.labels.preparing;
  player.root.dataset.state = 'loading';
  player.timeoutId = window.setTimeout(() => {
    if (player.pendingStage !== stage) return;
    showError(player, stage === 'probe' ? player.labels.probeTimeout : player.labels.streamTimeout);
  }, HOST_RESPONSE_TIMEOUT_MS);
  render(player);
}

function clearTimeoutFor(player: PlayerState, stage?: 'probe' | 'stream'): void {
  if (stage && player.pendingStage !== stage) return;
  if (player.timeoutId !== undefined) window.clearTimeout(player.timeoutId);
  player.timeoutId = undefined;
  player.pendingStage = undefined;
}

function cancelFrame(player: PlayerState): void {
  if (player.animationFrameId !== undefined) cancelAnimationFrame(player.animationFrameId);
  player.animationFrameId = undefined;
}

function showError(player: PlayerState, message: string): void {
  teardownStreams(player);
  player.waitingForStream = false;
  player.isPlaying = false;
  player.root.dataset.state = 'error';
  player.message.textContent = message;
  render(player);
  dispatch(player, 'error', { error: message });
}

function dispatch(
  player: PlayerState,
  type: RuntimeEventType,
  extra: Record<string, unknown> = {},
): void {
  window.dispatchEvent(
    new CustomEvent('neko-preview-media', {
      detail: {
        type,
        surfaceId: player.surfaceId,
        mediaType: player.mediaType,
        currentTime: player.currentTime,
        duration: player.duration,
        isPlaying: player.isPlaying,
        waitingForStream: player.waitingForStream,
        ...extra,
      },
    }),
  );
}

function findPlayer(value: unknown): PlayerState | undefined {
  return typeof value === 'string' ? players.get(value) : undefined;
}

function postHostMessage(message: Record<string, unknown>): void {
  window.__nekoNarrativePreviewPostMessage?.(message);
}

function normalizeLabels(labels: PreviewMediaLabels | undefined): NormalizedLabels {
  return {
    play: readLabel(labels?.play) ?? DEFAULT_LABELS.play,
    pause: readLabel(labels?.pause) ?? DEFAULT_LABELS.pause,
    loading: readLabel(labels?.loading) ?? DEFAULT_LABELS.loading,
    preparing: readLabel(labels?.preparing) ?? DEFAULT_LABELS.preparing,
    probeTimeout: readLabel(labels?.probeTimeout) ?? DEFAULT_LABELS.probeTimeout,
    streamTimeout: readLabel(labels?.streamTimeout) ?? DEFAULT_LABELS.streamTimeout,
  };
}

function readVideoDescriptor(value: unknown): HtmlVideoDescriptor | undefined {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    value['transport'] !== 'http' ||
    typeof value['url'] !== 'string' ||
    typeof value['mimeType'] !== 'string' ||
    typeof value['durationSeconds'] !== 'number' ||
    (value['preparationProfile'] !== 'h264-mp4-direct' &&
      value['preparationProfile'] !== 'vp8-webm-direct' &&
      value['preparationProfile'] !== 'h264-mp4-remux' &&
      value['preparationProfile'] !== 'h264-sdr-transcode')
  ) {
    return undefined;
  }
  return {
    version: 1,
    transport: 'http',
    url: value['url'],
    mimeType: value['mimeType'],
    preparationProfile: value['preparationProfile'],
    durationSeconds: value['durationSeconds'],
  };
}

function readAudioDescriptor(value: unknown): PcmStreamDescriptor | undefined {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    value['transport'] !== 'http' ||
    value['protocol'] !== 'neko-pcm-f32le-v1' ||
    typeof value['streamUrl'] !== 'string' ||
    typeof value['sampleRate'] !== 'number' ||
    typeof value['channels'] !== 'number'
  ) {
    return undefined;
  }
  return {
    version: 1,
    transport: 'http',
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: value['streamUrl'],
    sampleRate: value['sampleRate'],
    channels: value['channels'],
  };
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', loaded);
      video.removeEventListener('error', failed);
    };
    const loaded = (): void => {
      cleanup();
      resolve();
    };
    const failed = (): void => {
      cleanup();
      reject(new Error('Narrative preview video metadata failed to load.'));
    };
    video.addEventListener('loadedmetadata', loaded, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}

function createAudioVisualization(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'neko-preview-audio-visualization';
  for (let index = 0; index < 24; index += 1) {
    const bar = document.createElement('span');
    bar.style.setProperty('--bar-height', `${22 + ((index * 17 + 9) % 66)}%`);
    bar.style.setProperty('--bar-delay', `${(index * 73) % 800}ms`);
    root.appendChild(bar);
  }
  return root;
}

function readLabel(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

window.__nekoNarrativePreviewMediaRuntime = {
  mount,
  start,
  pause,
  resume,
  seek,
  stop,
  dispose,
  handleHostMessage,
};

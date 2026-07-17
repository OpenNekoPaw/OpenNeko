import {
  EngineAvStreamLifecycle,
  type EngineAvAudioStreamClient,
  type EngineAvFrameScheduler,
  type EngineAvVideoStreamClient,
  formatTime,
} from '@neko/neko-client';

type PreviewMediaType = 'audio' | 'video';

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

interface PreviewMediaStreamReadyMessage {
  readonly type: 'media:streamReady';
  readonly nodeId?: unknown;
  readonly videoStreamUrl?: unknown;
  readonly audioStreamUrl?: unknown;
  readonly mediaInfo?: unknown;
  readonly error?: unknown;
}

interface PreviewMediaProbeResultMessage {
  readonly type: 'media:probeResult';
  readonly nodeId?: unknown;
  readonly mediaInfo?: unknown;
  readonly error?: unknown;
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

type PreviewMediaRuntimeEventType = 'ready' | 'timeUpdate' | 'ended' | 'error';

interface PlayerState {
  readonly surfaceId: string;
  readonly mediaType: PreviewMediaType;
  readonly container: HTMLElement;
  readonly root: HTMLElement;
  readonly canvas?: HTMLCanvasElement;
  readonly audioVisualization?: HTMLElement;
  readonly title: HTMLElement;
  readonly time: HTMLElement;
  readonly progress: HTMLInputElement;
  readonly playButton: HTMLButtonElement;
  readonly message: HTMLElement;
  readonly labels: NormalizedPreviewMediaLabels;
  readonly posterUrl?: string;
  readonly label?: string;
  lastStartRequest?: PreviewMediaStartRequest;
  probeMediaInfo?: Record<string, unknown>;
  assetPath?: string;
  resourceRef?: unknown;
  documentResourceRef?: unknown;
  videoClient?: EngineAvVideoStreamClient;
  audioClient?: EngineAvAudioStreamClient;
  scheduler?: EngineAvFrameScheduler;
  lifecycle: EngineAvStreamLifecycle;
  animationFrameId?: number;
  requestTimeoutId?: number;
  pendingRequestStage?: 'probe' | 'stream';
  currentTime: number;
  duration: number;
  fps: number;
  width: number;
  height: number;
  isPlaying: boolean;
  shouldPlayWhenReady: boolean;
  waitingForStream: boolean;
  playStartTime: number;
  playWallTime: number;
  clockSource: 'wall' | 'audio';
}

interface PreviewMediaLabels {
  readonly play?: string;
  readonly pause?: string;
  readonly loading?: string;
  readonly preparing?: string;
  readonly probeTimeout?: string;
  readonly streamTimeout?: string;
}

interface NormalizedPreviewMediaLabels {
  readonly play: string;
  readonly pause: string;
  readonly loading: string;
  readonly preparing: string;
  readonly probeTimeout: string;
  readonly streamTimeout: string;
}

declare global {
  interface Window {
    __nekoNarrativePreviewPostMessage?: (message: Record<string, unknown>) => void;
    __nekoNarrativePreviewMediaRuntime?: PreviewMediaRuntimeApi;
  }
}

const DEFAULT_DURATION_SECONDS = 1.2;
const DEFAULT_VOLUME = 0.8;
const DEFAULT_LABELS: NormalizedPreviewMediaLabels = {
  play: 'Play',
  pause: 'Pause',
  loading: 'Loading media stream...',
  preparing: 'Preparing media stream...',
  probeTimeout: 'Media probe timed out.',
  streamTimeout: 'Media stream timed out.',
};
const HOST_MEDIA_RESPONSE_TIMEOUT_MS = 10_000;
const players = new Map<string, PlayerState>();

function createRuntime(): PreviewMediaRuntimeApi {
  return {
    mount,
    start,
    pause,
    resume,
    seek,
    stop,
    dispose,
    handleHostMessage,
  };
}

function mount(request: PreviewMediaMountRequest): void {
  const existing = players.get(request.surfaceId);
  if (existing) {
    dispose(request.surfaceId);
  }

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

  const canvas = request.mediaType === 'video' ? document.createElement('canvas') : undefined;
  const audioVisualization = request.mediaType === 'audio' ? createAudioVisualization() : undefined;

  if (canvas) {
    canvas.className = 'neko-preview-video-surface';
    viewport.appendChild(canvas);
  }
  if (audioVisualization) {
    viewport.appendChild(audioVisualization);
  }
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
  playButton.textContent = labels.pause;

  const progress = document.createElement('input');
  progress.type = 'range';
  progress.className = 'neko-preview-media-progress';
  progress.min = '0';
  progress.max = String(Math.max(request.duration ?? DEFAULT_DURATION_SECONDS, 0.1));
  progress.step = '0.01';
  progress.value = String(request.startTime ?? 0);

  const time = document.createElement('span');
  time.className = 'neko-preview-media-time';
  time.textContent = `${formatTime(request.startTime ?? 0)} / ${formatTime(
    request.duration ?? DEFAULT_DURATION_SECONDS,
  )}`;

  controls.append(playButton, progress, time);
  root.append(title, viewport, controls);
  request.container.replaceChildren(root);

  const lifecycle = new EngineAvStreamLifecycle({
    callbacks: {
      onClientsChanged: ({ videoClient, audioClient, scheduler }) => {
        const current = players.get(request.surfaceId);
        if (!current) return;
        current.videoClient = videoClient ?? undefined;
        current.audioClient = audioClient ?? undefined;
        current.scheduler = scheduler ?? undefined;
      },
    },
  });

  const player: PlayerState = {
    surfaceId: request.surfaceId,
    mediaType: request.mediaType,
    container: request.container,
    root,
    canvas,
    audioVisualization,
    title,
    time,
    progress,
    playButton,
    message,
    labels,
    posterUrl: request.posterUrl,
    label: request.label,
    currentTime: request.startTime ?? 0,
    duration: request.duration ?? DEFAULT_DURATION_SECONDS,
    fps: 30,
    width: 640,
    height: 360,
    isPlaying: false,
    shouldPlayWhenReady: false,
    waitingForStream: true,
    playStartTime: request.startTime ?? 0,
    playWallTime: performance.now(),
    clockSource: 'wall',
    lifecycle,
  };
  players.set(request.surfaceId, player);

  playButton.addEventListener('click', () => {
    if (player.isPlaying) {
      pause(player.surfaceId);
    } else {
      resume(player.surfaceId);
    }
  });
  progress.addEventListener('input', () => {
    player.currentTime = Number(progress.value);
    renderPlayer(player);
  });
  progress.addEventListener('change', () => {
    seek(player.surfaceId, Number(progress.value));
  });

  renderPlayer(player);
}

function start(request: PreviewMediaStartRequest): void {
  const player = players.get(request.surfaceId);
  if (!player) {
    return;
  }
  player.lastStartRequest = request;
  player.probeMediaInfo = undefined;
  player.assetPath = request.assetPath;
  player.resourceRef = request.resourceRef;
  player.documentResourceRef = request.documentResourceRef;
  player.shouldPlayWhenReady = request.autoPlay === true;
  player.waitingForStream = true;
  player.message.textContent = player.labels.preparing;
  player.root.dataset.state = 'loading';
  scheduleHostResponseTimeout(player, 'probe');
  renderPlayer(player);
  postHostMessage({
    type: 'media:probe',
    nodeId: request.surfaceId,
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
  player.audioClient?.pause();
  player.scheduler?.flush();
  cancelPlayerFrame(player);
  postHostMessage({ type: 'media:pause', nodeId: surfaceId });
  renderPlayer(player);
}

function resume(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  player.shouldPlayWhenReady = true;
  if (player.waitingForStream) {
    renderPlayer(player);
    return;
  }
  if (shouldRestartMediaProbe(player)) {
    const request = player.lastStartRequest;
    if (request) {
      start({ ...request, autoPlay: true, startTime: player.currentTime });
    }
    return;
  }
  if (!player.videoClient && !player.audioClient) {
    requestMediaStream(player);
    return;
  }
  player.isPlaying = true;
  player.audioClient?.resume();
  player.playStartTime = player.currentTime;
  player.playWallTime = performance.now();
  player.clockSource = 'wall';
  postHostMessage({ type: 'media:resume', nodeId: surfaceId });
  schedulePlaybackLoop(player);
  renderPlayer(player);
}

function shouldRestartMediaProbe(player: PlayerState): boolean {
  if (player.waitingForStream) {
    return false;
  }
  if (player.root.dataset.state === 'error') {
    return true;
  }
  return !player.probeMediaInfo && !player.videoClient && !player.audioClient;
}

function seek(surfaceId: string, time: number): void {
  const player = players.get(surfaceId);
  if (!player) return;
  const nextTime = clamp(time, 0, player.duration);
  player.currentTime = nextTime;
  player.playStartTime = nextTime;
  player.playWallTime = performance.now();
  player.clockSource = 'wall';
  player.scheduler?.flush();
  player.videoClient?.resetDecoder?.();
  player.audioClient?.resetClock();
  postHostMessage({ type: 'media:seek', nodeId: surfaceId, time: nextTime });
  renderPlayer(player);
}

function stop(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  player.isPlaying = false;
  player.shouldPlayWhenReady = false;
  player.audioClient?.pause();
  cancelPlayerFrame(player);
  postHostMessage({ type: 'media:stop', nodeId: surfaceId });
  renderPlayer(player);
}

function dispose(surfaceId: string): void {
  const player = players.get(surfaceId);
  if (!player) return;
  players.delete(surfaceId);
  teardownStreams(player);
  player.lifecycle.dispose();
  postHostMessage({ type: 'media:stop', nodeId: surfaceId });
  player.container.replaceChildren();
}

function handleHostMessage(message: unknown): void {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return;
  }
  if (message.type === 'media:probeResult') {
    handleProbeResult(message as unknown as PreviewMediaProbeResultMessage);
  } else if (message.type === 'media:streamReady') {
    handleStreamReady(message as unknown as PreviewMediaStreamReadyMessage);
  }
}

function handleProbeResult(message: PreviewMediaProbeResultMessage): void {
  const surfaceId = typeof message.nodeId === 'string' ? message.nodeId : undefined;
  const player = surfaceId ? players.get(surfaceId) : undefined;
  if (!player) return;
  clearHostResponseTimeout(player, 'probe');
  if (message.error) {
    showError(player, String(message.error));
    return;
  }
  player.waitingForStream = true;
  player.message.textContent = player.labels.preparing;
  player.root.dataset.state = 'loading';
  const mediaInfo = isRecord(message.mediaInfo) ? message.mediaInfo : {};
  player.probeMediaInfo = mediaInfo;
  const duration = readNumber(mediaInfo.duration);
  if (duration !== undefined && duration > 0) {
    player.duration = duration;
  }
  const width = readNumber(mediaInfo.width);
  const height = readNumber(mediaInfo.height);
  const fps = readNumber(mediaInfo.fps);
  player.width = width ?? player.width;
  player.height = height ?? player.height;
  player.fps = fps ?? player.fps;
  player.progress.max = String(Math.max(player.duration, 0.1));
  if (player.shouldPlayWhenReady) {
    requestMediaStream(player);
    return;
  }
  player.waitingForStream = false;
  player.message.textContent = '';
  player.root.dataset.state = 'ready';
  renderPlayer(player);
  dispatchMediaRuntimeEvent(player, 'ready');
}

function requestMediaStream(player: PlayerState): void {
  const mediaInfo = player.probeMediaInfo;
  if (!mediaInfo) {
    const request = player.lastStartRequest;
    if (request) {
      start({ ...request, autoPlay: true, startTime: player.currentTime });
      return;
    }
    showError(player, player.labels.preparing);
    return;
  }
  player.shouldPlayWhenReady = true;
  player.waitingForStream = true;
  player.message.textContent = player.labels.preparing;
  player.root.dataset.state = 'loading';
  scheduleHostResponseTimeout(player, 'stream');
  renderPlayer(player);
  postHostMessage({
    type: 'media:play',
    nodeId: player.surfaceId,
    assetPath: player.assetPath,
    resourceRef: player.resourceRef,
    documentResourceRef: player.documentResourceRef,
    mediaInfo,
    mediaType: player.mediaType,
    startTime: player.currentTime,
    speed: 1,
  });
}

function handleStreamReady(message: PreviewMediaStreamReadyMessage): void {
  const surfaceId = typeof message.nodeId === 'string' ? message.nodeId : undefined;
  const player = surfaceId ? players.get(surfaceId) : undefined;
  if (!player) return;
  clearHostResponseTimeout(player, 'stream');
  if (message.error) {
    showError(player, String(message.error));
    return;
  }
  teardownStreams(player);
  const mediaInfo = isRecord(message.mediaInfo) ? message.mediaInfo : {};
  player.duration = readNumber(mediaInfo.duration) ?? player.duration;
  player.width = readNumber(mediaInfo.width) ?? player.width;
  player.height = readNumber(mediaInfo.height) ?? player.height;
  player.fps = readNumber(mediaInfo.fps) ?? player.fps;
  player.progress.max = String(Math.max(player.duration, 0.1));
  player.waitingForStream = false;
  player.message.textContent = '';
  player.root.dataset.state = 'playing';

  const videoStreamUrl =
    typeof message.videoStreamUrl === 'string' ? message.videoStreamUrl : undefined;
  const audioStreamUrl =
    typeof message.audioStreamUrl === 'string' ? message.audioStreamUrl : undefined;

  void player.lifecycle
    .start({
      video:
        player.mediaType === 'video' && videoStreamUrl
          ? {
              websocketUrl: videoStreamUrl,
              width: player.width,
              height: player.height,
              onFrame: (frame) => handleVideoFrame(player, frame),
              onError: (error) => showError(player, String(error)),
            }
          : undefined,
      audio: audioStreamUrl
        ? {
            websocketUrl: audioStreamUrl,
            volume: DEFAULT_VOLUME,
            onError: (error) => showError(player, String(error)),
          }
        : undefined,
      fps: player.fps,
      schedulerMode: player.mediaType === 'video' ? 'video' : 'none',
      videoFrameRoute: 'callback',
    })
    .catch((error) => showError(player, String(error)));

  player.isPlaying = player.shouldPlayWhenReady;
  player.playStartTime = player.currentTime;
  player.playWallTime = performance.now();
  player.clockSource = 'wall';
  if (player.isPlaying) {
    schedulePlaybackLoop(player);
  } else {
    player.audioClient?.pause();
    postHostMessage({ type: 'media:pause', nodeId: player.surfaceId });
  }
  renderPlayer(player);
  dispatchMediaRuntimeEvent(player, 'ready');
}

function handleVideoFrame(player: PlayerState, frame: VideoFrame): void {
  if (!player.isPlaying) {
    drawVideoFrame(player, frame);
    return;
  }
  if (player.scheduler) {
    player.scheduler.enqueue(frame);
    return;
  }
  drawVideoFrame(player, frame);
}

function schedulePlaybackLoop(player: PlayerState): void {
  cancelPlayerFrame(player);
  const tick = () => {
    if (!player.isPlaying) {
      return;
    }
    const audioClient = player.audioClient;
    if (audioClient?.isClockReady) {
      if (player.clockSource === 'wall') {
        player.clockSource = 'audio';
        player.scheduler?.flush();
      }
      player.currentTime = audioClient.getCurrentTime();
    } else {
      const elapsed = (performance.now() - player.playWallTime) / 1000;
      player.currentTime = player.playStartTime + elapsed;
    }

    if (player.currentTime >= player.duration) {
      player.currentTime = player.duration;
      player.isPlaying = false;
      player.scheduler?.flush();
      renderPlayer(player);
      dispatchMediaRuntimeEvent(player, 'ended');
      postHostMessage({ type: 'media:stop', nodeId: player.surfaceId });
      return;
    }

    const scheduler = player.scheduler;
    if (scheduler) {
      const result = scheduler.schedule(player.currentTime * 1_000_000);
      if (result.action === 'render' && result.frame) {
        drawVideoFrame(player, result.frame);
      }
    }
    renderPlayer(player);
    player.animationFrameId = window.requestAnimationFrame(tick);
  };
  player.animationFrameId = window.requestAnimationFrame(tick);
}

function renderPlayer(player: PlayerState): void {
  player.playButton.textContent = player.isPlaying ? player.labels.pause : player.labels.play;
  player.playButton.disabled = player.waitingForStream;
  player.progress.value = String(clamp(player.currentTime, 0, player.duration));
  player.time.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
  dispatchMediaRuntimeEvent(player, 'timeUpdate');
}

function drawVideoFrame(player: PlayerState, frame: VideoFrame): void {
  const canvas = player.canvas;
  if (!canvas) {
    frame.close();
    return;
  }
  const context = canvas.getContext('2d');
  if (!context) {
    frame.close();
    return;
  }
  if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
    canvas.width = frame.displayWidth;
    canvas.height = frame.displayHeight;
  }
  context.drawImage(frame, 0, 0, canvas.width, canvas.height);
  frame.close();
}

function teardownStreams(player: PlayerState): void {
  clearHostResponseTimeout(player);
  cancelPlayerFrame(player);
  player.audioClient?.setVolume(0);
  player.lifecycle.stop();
  player.scheduler = undefined;
  player.videoClient = undefined;
  player.audioClient = undefined;
}

function cancelPlayerFrame(player: PlayerState): void {
  if (player.animationFrameId !== undefined) {
    window.cancelAnimationFrame(player.animationFrameId);
    player.animationFrameId = undefined;
  }
}

function showError(player: PlayerState, message: string): void {
  teardownStreams(player);
  player.waitingForStream = false;
  player.isPlaying = false;
  player.root.dataset.state = 'error';
  player.message.textContent = message;
  renderPlayer(player);
  dispatchMediaRuntimeEvent(player, 'error', { error: message });
}

function dispatchMediaRuntimeEvent(
  player: PlayerState,
  type: PreviewMediaRuntimeEventType,
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

function scheduleHostResponseTimeout(player: PlayerState, stage: 'probe' | 'stream'): void {
  clearHostResponseTimeout(player);
  player.pendingRequestStage = stage;
  player.requestTimeoutId = window.setTimeout(() => {
    if (player.pendingRequestStage !== stage) {
      return;
    }
    showError(player, stage === 'probe' ? player.labels.probeTimeout : player.labels.streamTimeout);
  }, HOST_MEDIA_RESPONSE_TIMEOUT_MS);
}

function clearHostResponseTimeout(player: PlayerState, stage?: 'probe' | 'stream'): void {
  if (stage && player.pendingRequestStage !== stage) {
    return;
  }
  if (player.requestTimeoutId !== undefined) {
    window.clearTimeout(player.requestTimeoutId);
    player.requestTimeoutId = undefined;
  }
  if (!stage || player.pendingRequestStage === stage) {
    player.pendingRequestStage = undefined;
  }
}

function postHostMessage(message: Record<string, unknown>): void {
  window.__nekoNarrativePreviewPostMessage?.(message);
}

function normalizeLabels(labels: PreviewMediaLabels | undefined): NormalizedPreviewMediaLabels {
  return {
    play: readLabel(labels?.play) ?? DEFAULT_LABELS.play,
    pause: readLabel(labels?.pause) ?? DEFAULT_LABELS.pause,
    loading: readLabel(labels?.loading) ?? DEFAULT_LABELS.loading,
    preparing: readLabel(labels?.preparing) ?? DEFAULT_LABELS.preparing,
    probeTimeout: readLabel(labels?.probeTimeout) ?? DEFAULT_LABELS.probeTimeout,
    streamTimeout: readLabel(labels?.streamTimeout) ?? DEFAULT_LABELS.streamTimeout,
  };
}

function readLabel(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

window.__nekoNarrativePreviewMediaRuntime = createRuntime();

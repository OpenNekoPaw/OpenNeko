/**
 * StreamingController — video/audio stream lifecycle management.
 *
 * Handles:
 * - Start/stop dual H264 streams (current + previous)
 * - Start/stop audio-only streams (audio diff mode)
 * - Playback control forwarding (play/pause/seek)
 * - Lazy stream creation on first play (neko-preview pattern)
 */

import type {
  VideoDiffDetails,
  AudioDiffDetails,
  StreamConfig,
  AudioStreamConfig,
} from '@neko/shared';
import type { IHandlerContext } from './types';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('StreamingController');

// =========================================================================
// Video Streaming
// =========================================================================

/**
 * Start dual H264 streams (current + previous) via neko-engine.
 *
 * Flow:
 *   1. Ensure frame server is running -> get port
 *   2. Probe both files -> get resolution, fps, duration
 *   3. Dispatch `videos:stream` for each file -> get streamIds
 *   4. Send `mediaDiff:streamConfig` to webview immediately
 *      (no engine-level pause — neko-preview pattern: streams
 *       created lazily on first play, WebSocket clients connect
 *       immediately after config arrives)
 */
export async function handleStartStreaming(
  ctx: IHandlerContext,
  requestId?: string,
): Promise<void> {
  try {
    const engine = ctx.requireEngine();

    // 1. Resolve file paths for both versions.
    // If git show is still in progress, wait for it rather than failing immediately.
    // This handles the race where the user clicks Play before ensurePreviousFilePath
    // finishes (3-30s for large repos).
    const currentPath = ctx.fileUri.fsPath;
    let previousPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
    if (!previousPath && ctx.requestState.fetchPromise) {
      await ctx.requestState.fetchPromise;
      previousPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
    }
    if (!previousPath) {
      throw new Error('No previous file available for streaming');
    }

    // 2. Extract resolution/fps/duration from cached diff result (avoids ~400ms redundant probes).
    //    The diff analysis always runs before streaming, so lastDiffResult should be populated.
    //    Falls back to probing only if the cache is empty (shouldn't happen in normal flow).
    let width: number;
    let height: number;
    let fps: number;
    let duration: number;

    const videoDetails =
      ctx.lastDiffResult?.mediaType === 'video'
        ? (ctx.lastDiffResult.details as VideoDiffDetails)
        : null;

    if (videoDetails) {
      width = Math.max(
        videoDetails.resolution.current.width,
        videoDetails.resolution.previous.width,
      );
      height = Math.max(
        videoDetails.resolution.current.height,
        videoDetails.resolution.previous.height,
      );
      fps = videoDetails.fps.current || 30;
      duration = Math.max(videoDetails.duration.current, videoDetails.duration.previous);
      logger.debug('Using cached diff metadata:', { width, height, fps, duration });
    } else {
      // Fallback: probe if diff result is not cached (e.g., streaming started without prior diff)
      logger.warn('No cached diff result — falling back to probe');
      const [currentInfo, previousInfo] = await Promise.all([
        engine.probe('videos', currentPath),
        engine.probe('videos', previousPath),
      ]);
      width = Math.max(currentInfo.width, previousInfo.width);
      height = Math.max(currentInfo.height, previousInfo.height);
      fps = currentInfo.fps || 30;
      duration = Math.max(currentInfo.duration, previousInfo.duration);
    }

    // 3. Start streams for both files via videos:stream
    const [currentHandle, previousHandle] = await Promise.all([
      engine.createStream('videos', currentPath, { sessionId: ctx.sessionId }),
      engine.createStream('videos', previousPath, { sessionId: ctx.sessionId }),
    ]);

    ctx.currentStreamId = currentHandle.streamId;
    ctx.previousStreamId = previousHandle.streamId;

    // 4. Always try to create audio streams — don't rely on metadata.
    // If the file has no audio track, the engine returns an error which we catch.
    if (videoDetails) {
      logger.debug('Audio track changed:', videoDetails.audioTrackChanged);
    }
    try {
      const [curAudioResult, prevAudioResult] = await Promise.allSettled([
        engine.createStream('audios', currentPath, { sessionId: ctx.sessionId }),
        engine.createStream('audios', previousPath, { sessionId: ctx.sessionId }),
      ]);

      if (curAudioResult.status === 'fulfilled') {
        ctx.currentAudioStreamId = curAudioResult.value.streamId;
        logger.debug('Current audio stream created:', ctx.currentAudioStreamId);
      } else {
        logger.debug('Current file has no audio track (or stream creation failed)');
      }

      if (prevAudioResult.status === 'fulfilled') {
        ctx.previousAudioStreamId = prevAudioResult.value.streamId;
        logger.debug('Previous audio stream created:', ctx.previousAudioStreamId);
      } else {
        logger.debug('Previous file has no audio track (or stream creation failed)');
      }
    } catch (audioErr) {
      logger.warn('Audio stream creation failed (non-fatal):', audioErr);
    }

    // 5. Send config to webview immediately (no engine-level pause).
    // Streams auto-play — WebSocket clients connect as soon as
    // config arrives, well within the subscriber timeout.
    const config: StreamConfig = {
      port: engine.port,
      currentStreamId: ctx.currentStreamId,
      previousStreamId: ctx.previousStreamId,
      currentAudioStreamId: ctx.currentAudioStreamId ?? undefined,
      previousAudioStreamId: ctx.previousAudioStreamId ?? undefined,
      width,
      height,
      fps,
      duration,
    };

    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamConfig',
      payload: config,
    });
  } catch (error) {
    logger.error('Failed to start streaming:', error);
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamError',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Stop all streams (video + audio) and clean up state.
 */
export async function handleStopStreaming(
  ctx: IHandlerContext,
  _requestId?: string,
): Promise<void> {
  try {
    const engine = ctx.requireEngine();
    const stopPromises: Promise<void>[] = [];

    for (const sid of [
      ctx.currentStreamId,
      ctx.previousStreamId,
      ctx.currentAudioStreamId,
      ctx.previousAudioStreamId,
    ]) {
      if (sid) {
        stopPromises.push(engine.controlStream('streams', sid, 'stop'));
      }
    }

    await Promise.allSettled(stopPromises);
  } catch (error) {
    logger.error('Failed to stop streaming:', error);
  } finally {
    ctx.currentStreamId = null;
    ctx.previousStreamId = null;
    ctx.currentAudioStreamId = null;
    ctx.previousAudioStreamId = null;
  }
}

/**
 * Forward playback control (play/pause/seek) to all active streams.
 *
 * On first 'play', lazily creates streams (neko-preview pattern):
 * streams are only created when the user clicks Play, ensuring
 * WebSocket clients connect immediately after creation and well
 * within the engine's subscriber timeout.
 *
 * Controls both video and audio streams simultaneously.
 */
export async function handleStreamControl(
  ctx: IHandlerContext,
  action: 'play' | 'pause' | 'seek',
  payload: { time?: number; speed?: number },
  requestId?: string,
): Promise<void> {
  // Lazy stream creation on first play (neko-preview pattern)
  if (action === 'play' && !ctx.currentStreamId) {
    await handleStartStreaming(ctx, requestId);
    // Streams auto-play after creation — no resume needed
    return;
  }

  // Collect all active streams with their dispatch group
  const allStreams = [
    { id: ctx.currentStreamId, group: 'videos' },
    { id: ctx.previousStreamId, group: 'videos' },
    { id: ctx.currentAudioStreamId, group: 'audios' },
    { id: ctx.previousAudioStreamId, group: 'audios' },
  ].filter((s): s is { id: string; group: string } => s.id != null);

  if (allStreams.length === 0) return;

  try {
    const engine = ctx.requireEngine();
    let streamAction: 'resume' | 'pause' | 'seek';
    let options: Record<string, unknown>;

    switch (action) {
      case 'play':
        streamAction = 'resume';
        options = { speed: payload.speed ?? 1.0 };
        break;
      case 'pause':
        streamAction = 'pause';
        options = {};
        break;
      case 'seek':
        streamAction = 'seek';
        options = { time: payload.time ?? 0 };
        break;
    }

    await Promise.all(
      allStreams.map((s) => engine.controlStream(s.group, s.id, streamAction, options)),
    );
  } catch (error) {
    logger.error(`Stream control '${action}' failed:`, error);
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamError',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =========================================================================
// Audio-Only Streaming (for Audio Diff)
// =========================================================================

/**
 * Start dual audio-only streams (current + previous) for audio diff.
 *
 * Flow:
 *   1. Ensure frame server is running -> get port
 *   2. Resolve file paths
 *   3. Dispatch `audios:stream` for each file -> get streamIds
 *   4. Send `mediaDiff:audioStreamConfig` to webview immediately
 *      (no engine-level pause — AudioStreamClient pauses locally
 *       to avoid subscriber timeout)
 */
export async function handleStartAudioStreaming(
  ctx: IHandlerContext,
  requestId?: string,
): Promise<void> {
  try {
    const engine = ctx.requireEngine();

    // 1. Resolve file paths, awaiting git fetch if still in progress.
    const currentPath = ctx.fileUri.fsPath;
    let previousPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
    if (!previousPath && ctx.requestState.fetchPromise) {
      await ctx.requestState.fetchPromise;
      previousPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
    }
    if (!previousPath) {
      throw new Error('No previous file available for audio streaming');
    }

    // 2. Extract duration from cached diff result (avoids ~400ms redundant probes).
    let duration: number;

    const audioDetails =
      ctx.lastDiffResult?.mediaType === 'audio'
        ? (ctx.lastDiffResult.details as AudioDiffDetails)
        : null;

    if (audioDetails) {
      duration = Math.max(audioDetails.duration.current, audioDetails.duration.previous);
      logger.debug('Using cached audio diff metadata:', { duration });
    } else {
      logger.warn('No cached audio diff result — falling back to probe');
      const [currentInfo, previousInfo] = await Promise.all([
        engine.probe('audios', currentPath),
        engine.probe('audios', previousPath),
      ]);
      duration = Math.max(currentInfo.duration ?? 0, previousInfo.duration ?? 0);
    }

    // 3. Create audio streams
    const [curHandle, prevHandle] = await Promise.all([
      engine.createStream('audios', currentPath, { sessionId: ctx.sessionId }),
      engine.createStream('audios', previousPath, { sessionId: ctx.sessionId }),
    ]);

    ctx.currentAudioOnlyStreamId = curHandle.streamId;
    ctx.previousAudioOnlyStreamId = prevHandle.streamId;

    // 4. Send config to webview immediately so WebSocket clients
    //    connect before the engine subscriber timeout fires.
    //    AudioStreamClients pause locally to suppress auto-playback.
    const config: AudioStreamConfig = {
      port: engine.port,
      currentAudioStreamId: ctx.currentAudioOnlyStreamId,
      previousAudioStreamId: ctx.previousAudioOnlyStreamId,
      duration,
    };

    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:audioStreamConfig',
      payload: config,
    });
  } catch (error) {
    logger.error('Failed to start audio streaming:', error);
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamError',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Stop audio-only streams and clean up state.
 */
export async function handleStopAudioStreaming(
  ctx: IHandlerContext,
  _requestId?: string,
): Promise<void> {
  try {
    const engine = ctx.requireEngine();
    const stopPromises: Promise<void>[] = [];

    for (const sid of [ctx.currentAudioOnlyStreamId, ctx.previousAudioOnlyStreamId]) {
      if (sid) {
        stopPromises.push(engine.controlStream('streams', sid, 'stop'));
      }
    }

    await Promise.allSettled(stopPromises);
  } catch (error) {
    logger.error('Failed to stop audio streaming:', error);
  } finally {
    ctx.currentAudioOnlyStreamId = null;
    ctx.previousAudioOnlyStreamId = null;
  }
}

/**
 * Forward playback control to audio-only streams.
 *
 * On first 'play', lazily creates streams (neko-preview pattern):
 * streams are only created when the user clicks Play, ensuring
 * WebSocket clients connect immediately after creation and well
 * within the engine's subscriber timeout.
 */
export async function handleAudioStreamControl(
  ctx: IHandlerContext,
  action: 'play' | 'pause' | 'seek',
  payload: { time?: number },
  requestId?: string,
): Promise<void> {
  // Lazy stream creation on first play (neko-preview pattern)
  if (action === 'play' && !ctx.currentAudioOnlyStreamId) {
    await handleStartAudioStreaming(ctx, requestId);
    // Streams auto-play after creation — no resume needed
    return;
  }

  const allStreams = [ctx.currentAudioOnlyStreamId, ctx.previousAudioOnlyStreamId].filter(
    (id): id is string => id != null,
  );

  if (allStreams.length === 0) return;

  try {
    const engine = ctx.requireEngine();
    let streamAction: 'resume' | 'pause' | 'seek';
    let options: Record<string, unknown>;

    switch (action) {
      case 'play':
        streamAction = 'resume';
        options = {};
        break;
      case 'pause':
        streamAction = 'pause';
        options = {};
        break;
      case 'seek':
        streamAction = 'seek';
        options = { time: payload.time ?? 0 };
        break;
    }

    await Promise.all(
      allStreams.map((sid) => engine.controlStream('audios', sid, streamAction, options)),
    );
  } catch (error) {
    logger.error(`Audio stream control '${action}' failed:`, error);
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamError',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

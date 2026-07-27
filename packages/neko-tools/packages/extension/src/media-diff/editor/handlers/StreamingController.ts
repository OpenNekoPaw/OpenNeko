import type {
  AudioDiffDetails,
  AudioStreamConfig,
  StreamConfig,
  VideoDiffDetails,
} from '@neko-tools/contracts';
import type { IHandlerContext } from './types';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('StreamingController');

export async function handleStartStreaming(
  ctx: IHandlerContext,
  requestId?: string,
  startTime = 0,
  playbackRate = 1,
): Promise<void> {
  await handleStopStreaming(ctx);
  const generation = ctx.videoStreamGeneration;
  const controller = new AbortController();
  ctx.videoStreamAbortController = controller;
  const ownedSessionIds: string[] = [];
  try {
    const [currentPath, previousPath] = await resolvePairPaths(ctx);
    const details = getVideoDetails(ctx);
    const [currentProbe, previousProbe] = details
      ? [undefined, undefined]
      : await Promise.all([
          ctx.mediaRuntime.probe(currentPath, controller.signal),
          ctx.mediaRuntime.probe(previousPath, controller.signal),
        ]);
    const width = details
      ? Math.max(details.resolution.current.width, details.resolution.previous.width)
      : Math.max(currentProbe?.video?.width ?? 0, previousProbe?.video?.width ?? 0);
    const height = details
      ? Math.max(details.resolution.current.height, details.resolution.previous.height)
      : Math.max(currentProbe?.video?.height ?? 0, previousProbe?.video?.height ?? 0);
    const fps = details?.fps.current || currentProbe?.video?.framesPerSecond || 30;
    const duration = details
      ? Math.max(details.duration.current, details.duration.previous)
      : Math.max(currentProbe?.durationSeconds ?? 0, previousProbe?.durationSeconds ?? 0);
    const currentVideo = await ctx.mediaRuntime.prepareVideo(
      currentPath,
      undefined,
      controller.signal,
    );
    ownedSessionIds.push(currentVideo.sessionId);
    controller.signal.throwIfAborted();
    const previousVideo = await ctx.mediaRuntime.prepareVideo(
      previousPath,
      undefined,
      controller.signal,
    );
    ownedSessionIds.push(previousVideo.sessionId);
    controller.signal.throwIfAborted();
    const remaining = Math.max(0, duration - startTime);
    const audioResults =
      remaining > 0
        ? await Promise.allSettled([
            ctx.mediaRuntime.startPcm(
              currentPath,
              {
                startTimeSeconds: startTime,
                durationSeconds: remaining,
                playbackRate,
              },
              controller.signal,
            ),
            ctx.mediaRuntime.startPcm(
              previousPath,
              {
                startTimeSeconds: startTime,
                durationSeconds: remaining,
                playbackRate,
              },
              controller.signal,
            ),
          ])
        : [];
    const currentAudio =
      audioResults[0]?.status === 'fulfilled' ? audioResults[0].value : undefined;
    const previousAudio =
      audioResults[1]?.status === 'fulfilled' ? audioResults[1].value : undefined;
    if (currentAudio) ownedSessionIds.push(currentAudio.sessionId);
    if (previousAudio) ownedSessionIds.push(previousAudio.sessionId);
    controller.signal.throwIfAborted();
    if (ctx.videoStreamGeneration !== generation) {
      throw new Error('Media diff playback request was superseded.');
    }
    ctx.currentStreamId = currentVideo.sessionId;
    ctx.previousStreamId = previousVideo.sessionId;
    ctx.currentAudioStreamId = currentAudio?.sessionId ?? null;
    ctx.previousAudioStreamId = previousAudio?.sessionId ?? null;
    const config: StreamConfig = {
      currentVideo: currentVideo.video,
      previousVideo: previousVideo.video,
      ...(currentAudio ? { currentAudio: currentAudio.stream } : {}),
      ...(previousAudio ? { previousAudio: previousAudio.stream } : {}),
      width,
      height,
      fps,
      duration,
      startTime,
      playbackRate,
    };
    ctx.sendMessage({ requestId, type: 'mediaDiff:streamConfig', payload: config });
    if (ctx.videoStreamAbortController === controller) {
      ctx.videoStreamAbortController = null;
    }
  } catch (error) {
    await stopSessionsAfterStartupFailure(ctx, ownedSessionIds);
    if (ctx.videoStreamAbortController === controller) {
      ctx.videoStreamAbortController = null;
    }
    if (!controller.signal.aborted && ctx.videoStreamGeneration === generation) {
      logger.error('Failed to start media diff playback:', error);
      ctx.sendMessage({
        requestId,
        type: 'mediaDiff:streamError',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function handleStopStreaming(ctx: IHandlerContext, requestId?: string): Promise<void> {
  const generation = ++ctx.videoStreamGeneration;
  ctx.videoStreamAbortController?.abort(new Error('Media diff playback stopped.'));
  ctx.videoStreamAbortController = null;
  const sessionIds = [
    ctx.currentStreamId,
    ctx.previousStreamId,
    ctx.currentAudioStreamId,
    ctx.previousAudioStreamId,
  ].filter((value): value is string => value !== null);
  ctx.currentStreamId = null;
  ctx.previousStreamId = null;
  ctx.currentAudioStreamId = null;
  ctx.previousAudioStreamId = null;
  await stopSessions(ctx, sessionIds);
  if (requestId && ctx.videoStreamGeneration === generation) {
    ctx.sendMessage({ requestId, type: 'mediaDiff:streamConfig', payload: null });
  }
}

export async function handleStreamControl(
  ctx: IHandlerContext,
  action: 'play' | 'pause' | 'seek',
  payload: { time?: number; speed?: number },
  requestId?: string,
): Promise<void> {
  if (action === 'pause') {
    await handleStopStreaming(ctx, requestId);
    return;
  }
  await handleStartStreaming(
    ctx,
    requestId,
    action === 'seek' ? (payload.time ?? 0) : 0,
    payload.speed ?? 1,
  );
}

export async function handleStartAudioStreaming(
  ctx: IHandlerContext,
  requestId?: string,
  startTime = 0,
  playbackRate = 1,
): Promise<void> {
  await handleStopAudioStreaming(ctx);
  const generation = ctx.audioStreamGeneration;
  const controller = new AbortController();
  ctx.audioStreamAbortController = controller;
  const ownedSessionIds: string[] = [];
  try {
    const [currentPath, previousPath] = await resolvePairPaths(ctx);
    const details = getAudioDetails(ctx);
    const duration = details
      ? Math.max(details.duration.current, details.duration.previous)
      : Math.max(
          (await ctx.mediaRuntime.probe(currentPath, controller.signal)).durationSeconds,
          (await ctx.mediaRuntime.probe(previousPath, controller.signal)).durationSeconds,
        );
    const remaining = Math.max(0, duration - startTime);
    if (remaining <= 0) throw new Error('Audio diff playback start is outside the duration.');
    const currentAudio = await ctx.mediaRuntime.startPcm(
      currentPath,
      {
        startTimeSeconds: startTime,
        durationSeconds: remaining,
        playbackRate,
      },
      controller.signal,
    );
    ownedSessionIds.push(currentAudio.sessionId);
    controller.signal.throwIfAborted();
    const previousAudio = await ctx.mediaRuntime.startPcm(
      previousPath,
      {
        startTimeSeconds: startTime,
        durationSeconds: remaining,
        playbackRate,
      },
      controller.signal,
    );
    ownedSessionIds.push(previousAudio.sessionId);
    controller.signal.throwIfAborted();
    if (ctx.audioStreamGeneration !== generation) {
      throw new Error('Audio diff playback request was superseded.');
    }
    ctx.currentAudioOnlyStreamId = currentAudio.sessionId;
    ctx.previousAudioOnlyStreamId = previousAudio.sessionId;
    const config: AudioStreamConfig = {
      currentAudio: currentAudio.stream,
      previousAudio: previousAudio.stream,
      duration,
      startTime,
      playbackRate,
    };
    ctx.sendMessage({ requestId, type: 'mediaDiff:audioStreamConfig', payload: config });
    if (ctx.audioStreamAbortController === controller) {
      ctx.audioStreamAbortController = null;
    }
  } catch (error) {
    await stopSessionsAfterStartupFailure(ctx, ownedSessionIds);
    if (ctx.audioStreamAbortController === controller) {
      ctx.audioStreamAbortController = null;
    }
    if (!controller.signal.aborted && ctx.audioStreamGeneration === generation) {
      logger.error('Failed to start audio diff playback:', error);
      ctx.sendMessage({
        requestId,
        type: 'mediaDiff:streamError',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function handleStopAudioStreaming(
  ctx: IHandlerContext,
  requestId?: string,
): Promise<void> {
  const generation = ++ctx.audioStreamGeneration;
  ctx.audioStreamAbortController?.abort(new Error('Audio diff playback stopped.'));
  ctx.audioStreamAbortController = null;
  const sessionIds = [ctx.currentAudioOnlyStreamId, ctx.previousAudioOnlyStreamId].filter(
    (value): value is string => value !== null,
  );
  ctx.currentAudioOnlyStreamId = null;
  ctx.previousAudioOnlyStreamId = null;
  await stopSessions(ctx, sessionIds);
  if (requestId && ctx.audioStreamGeneration === generation) {
    ctx.sendMessage({ requestId, type: 'mediaDiff:audioStreamConfig', payload: null });
  }
}

export async function handleAudioStreamControl(
  ctx: IHandlerContext,
  action: 'play' | 'pause' | 'seek',
  payload: { time?: number },
  requestId?: string,
): Promise<void> {
  if (action === 'pause') {
    await handleStopAudioStreaming(ctx, requestId);
    return;
  }
  await handleStartAudioStreaming(ctx, requestId, action === 'seek' ? (payload.time ?? 0) : 0);
}

async function resolvePairPaths(ctx: IHandlerContext): Promise<[string, string]> {
  const currentPath = ctx.fileUri.fsPath;
  let previousPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
  if (!previousPath && ctx.requestState.fetchPromise) {
    await ctx.requestState.fetchPromise;
    previousPath = ctx.previousUri?.fsPath ?? ctx.requestState.previousFilePath;
  }
  if (!previousPath) throw new Error('No previous file is available for media diff playback.');
  return [currentPath, previousPath];
}

function getVideoDetails(ctx: IHandlerContext): VideoDiffDetails | undefined {
  const result = ctx.lastDiffResult;
  if (result?.mediaType !== 'video' || !('resolution' in result.details)) return undefined;
  return result.details;
}

function getAudioDetails(ctx: IHandlerContext): AudioDiffDetails | undefined {
  const result = ctx.lastDiffResult;
  if (result?.mediaType !== 'audio' || !('sampleRate' in result.details)) return undefined;
  return result.details;
}

async function stopSessions(ctx: IHandlerContext, sessionIds: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(
    sessionIds.map((sessionId) => ctx.mediaRuntime.stop(sessionId)),
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          new Error(`Failed to stop media runtime session "${sessionIds[index]}".`, {
            cause: result.reason,
          }),
        ]
      : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to stop one or more media runtime sessions.');
  }
}

async function stopSessionsAfterStartupFailure(
  ctx: IHandlerContext,
  sessionIds: readonly string[],
): Promise<void> {
  try {
    await stopSessions(ctx, sessionIds);
  } catch (cleanupError) {
    logger.error('Failed to clean up media runtime sessions after startup failure:', cleanupError);
  }
}

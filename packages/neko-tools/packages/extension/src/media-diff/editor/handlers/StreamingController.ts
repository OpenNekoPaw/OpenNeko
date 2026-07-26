import type {
  AudioDiffDetails,
  AudioStreamConfig,
  StreamConfig,
  VideoDiffDetails,
} from '@neko/shared';
import type { IHandlerContext } from './types';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('StreamingController');

export async function handleStartStreaming(
  ctx: IHandlerContext,
  requestId?: string,
  startTime = 0,
  playbackRate = 1,
): Promise<void> {
  try {
    const [currentPath, previousPath] = await resolvePairPaths(ctx);
    const details =
      ctx.lastDiffResult?.mediaType === 'video'
        ? (ctx.lastDiffResult.details as VideoDiffDetails)
        : undefined;
    const [currentProbe, previousProbe] = details
      ? [undefined, undefined]
      : await Promise.all([
          ctx.mediaRuntime.probe(currentPath),
          ctx.mediaRuntime.probe(previousPath),
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
    await handleStopStreaming(ctx);
    const [currentVideo, previousVideo] = await Promise.all([
      ctx.mediaRuntime.prepareVideo(currentPath),
      ctx.mediaRuntime.prepareVideo(previousPath),
    ]);
    ctx.currentStreamId = currentVideo.sessionId;
    ctx.previousStreamId = previousVideo.sessionId;
    const remaining = Math.max(0, duration - startTime);
    const audioResults =
      remaining > 0
        ? await Promise.allSettled([
            ctx.mediaRuntime.startPcm(currentPath, {
              startTimeSeconds: startTime,
              durationSeconds: remaining,
              playbackRate,
            }),
            ctx.mediaRuntime.startPcm(previousPath, {
              startTimeSeconds: startTime,
              durationSeconds: remaining,
              playbackRate,
            }),
          ])
        : [];
    const currentAudio =
      audioResults[0]?.status === 'fulfilled' ? audioResults[0].value : undefined;
    const previousAudio =
      audioResults[1]?.status === 'fulfilled' ? audioResults[1].value : undefined;
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
  } catch (error) {
    logger.error('Failed to start media diff playback:', error);
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamError',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleStopStreaming(ctx: IHandlerContext): Promise<void> {
  const sessionIds = [
    ctx.currentStreamId,
    ctx.previousStreamId,
    ctx.currentAudioStreamId,
    ctx.previousAudioStreamId,
  ].filter((value): value is string => value !== null);
  await Promise.allSettled(sessionIds.map((sessionId) => ctx.mediaRuntime.stop(sessionId)));
  ctx.currentStreamId = null;
  ctx.previousStreamId = null;
  ctx.currentAudioStreamId = null;
  ctx.previousAudioStreamId = null;
}

export async function handleStreamControl(
  ctx: IHandlerContext,
  action: 'play' | 'pause' | 'seek',
  payload: { time?: number; speed?: number },
  requestId?: string,
): Promise<void> {
  if (action === 'pause') return;
  if (action === 'play' && ctx.currentStreamId) return;
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
  try {
    const [currentPath, previousPath] = await resolvePairPaths(ctx);
    const details =
      ctx.lastDiffResult?.mediaType === 'audio'
        ? (ctx.lastDiffResult.details as AudioDiffDetails)
        : undefined;
    const duration = details
      ? Math.max(details.duration.current, details.duration.previous)
      : Math.max(
          (await ctx.mediaRuntime.probe(currentPath)).durationSeconds,
          (await ctx.mediaRuntime.probe(previousPath)).durationSeconds,
        );
    const remaining = Math.max(0, duration - startTime);
    if (remaining <= 0) throw new Error('Audio diff playback start is outside the duration.');
    await handleStopAudioStreaming(ctx);
    const [currentAudio, previousAudio] = await Promise.all([
      ctx.mediaRuntime.startPcm(currentPath, {
        startTimeSeconds: startTime,
        durationSeconds: remaining,
        playbackRate,
      }),
      ctx.mediaRuntime.startPcm(previousPath, {
        startTimeSeconds: startTime,
        durationSeconds: remaining,
        playbackRate,
      }),
    ]);
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
  } catch (error) {
    logger.error('Failed to start audio diff playback:', error);
    ctx.sendMessage({
      requestId,
      type: 'mediaDiff:streamError',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleStopAudioStreaming(ctx: IHandlerContext): Promise<void> {
  const sessionIds = [ctx.currentAudioOnlyStreamId, ctx.previousAudioOnlyStreamId].filter(
    (value): value is string => value !== null,
  );
  await Promise.allSettled(sessionIds.map((sessionId) => ctx.mediaRuntime.stop(sessionId)));
  ctx.currentAudioOnlyStreamId = null;
  ctx.previousAudioOnlyStreamId = null;
}

export async function handleAudioStreamControl(
  ctx: IHandlerContext,
  action: 'play' | 'pause' | 'seek',
  payload: { time?: number },
  requestId?: string,
): Promise<void> {
  if (action === 'pause') return;
  if (action === 'play' && ctx.currentAudioOnlyStreamId) return;
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

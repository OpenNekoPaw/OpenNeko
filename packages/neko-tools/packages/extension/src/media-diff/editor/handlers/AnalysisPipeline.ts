import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { getMediaType, type DiffOptions, type MediaType } from '@neko-tools/contracts';
import type { IHandlerContext } from './types';
import {
  sendVisualizationData,
  sendVisualizationDataForLocal,
  sendWaveformFromResult,
  startEarlyFrameExtraction,
  startEarlyWaveform,
} from './VisualizationHandler';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('AnalysisPipeline');

async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (data: string | Buffer) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function areFilesIdentical(currentPath: string, previousPath: string): Promise<boolean> {
  const [currentHash, previousHash] = await Promise.all([
    computeFileHash(currentPath),
    computeFileHash(previousPath),
  ]);
  return currentHash === previousHash;
}

async function ensurePreviousFilePath(ctx: IHandlerContext, ref: string): Promise<void> {
  if (ctx.previousUri || ctx.requestState.hasPreviousFileForRef(ref)) return;
  await ctx.requestState.clearPreviousFilePath();
  const extension = path.extname(ctx.fileUri.fsPath) || '.bin';
  const temporaryPath = ctx.tempFileService.createTempPath('media-diff-previous', extension);
  await ctx.diffService.extractPreviousToFile(ctx.fileUri, ref, temporaryPath);
  await ctx.requestState.setPreviousFilePath(temporaryPath, ref);
}

export function cancelCurrentAnalysis(ctx: IHandlerContext): void {
  ctx.requestState.cancelCurrentAnalysis();
}

export async function initializeDiff(
  ctx: IHandlerContext,
  ref = 'HEAD',
  requestId = requireRequestId(ctx),
): Promise<void> {
  ctx.lastRef = ref;
  if (ctx.previousUri) return initializeLocalDiff(ctx, requestId);
  if (ctx.isDisposed) return;

  const mediaType = requireMediaType(ctx.fileUri.fsPath);
  const controller = ctx.requestState.beginAnalysis();
  let backgroundOwnsController = false;
  try {
    if (mediaType === 'video' || mediaType === 'audio') {
      ctx.sendMessage({ requestId, type: 'mediaDiff:fetchState', state: 'fetching' });
      const fetchPromise = ensurePreviousFilePath(ctx, ref);
      ctx.requestState.fetchPromise = fetchPromise;
      await fetchPromise;
      ctx.requestState.clearFetchPromise(fetchPromise);
      ctx.sendMessage({ requestId, type: 'mediaDiff:fetchState', state: 'ready' });
      controller.signal.throwIfAborted();

      const previousPath = ctx.requestState.previousFilePath;
      if (!previousPath) throw new Error(`No ${ref} version is available for comparison.`);
      if (await areFilesIdentical(ctx.fileUri.fsPath, previousPath)) {
        ctx.sendMessage({
          requestId,
          type: 'mediaDiff:result',
          payload: { mediaType, similarity: 1, details: { identical: true } },
        });
        return;
      }

      backgroundOwnsController = true;
      runBackgroundComparison(ctx, mediaType, previousPath, ref, requestId, controller);
      return;
    }

    const result = await ctx.diffService.analyze(
      ctx.fileUri,
      ref,
      {},
      (progress, stage) =>
        ctx.sendMessage({
          requestId,
          type: 'mediaDiff:progress',
          payload: { progress, stage },
        }),
      controller.signal,
    );
    controller.signal.throwIfAborted();
    ctx.lastDiffResult = result;
    ctx.sendMessage({ requestId, type: 'mediaDiff:result', payload: result });
    await sendVisualizationData(ctx, result, ref, requestId);
  } catch (error) {
    sendAnalysisFailure(ctx, controller, requestId, error);
  } finally {
    if (!backgroundOwnsController) ctx.requestState.clearAbortController(controller);
  }
}

export async function initializeLocalDiff(
  ctx: IHandlerContext,
  requestId = requireRequestId(ctx),
): Promise<void> {
  if (ctx.isDisposed) return;
  const previousUri = ctx.previousUri;
  if (!previousUri) throw new Error('No previous file was selected for local comparison.');
  const mediaType = requireMediaType(ctx.fileUri.fsPath);
  const previousType = requireMediaType(previousUri.fsPath);
  if (mediaType !== previousType) {
    throw new Error(`Cannot compare different media types: ${mediaType} vs ${previousType}`);
  }

  const controller = ctx.requestState.beginAnalysis();
  let backgroundOwnsController = false;
  try {
    if (await areFilesIdentical(ctx.fileUri.fsPath, previousUri.fsPath)) {
      ctx.sendMessage({
        requestId,
        type: 'mediaDiff:result',
        payload: { mediaType, similarity: 1, details: { identical: true } },
      });
      if (mediaType === 'image') {
        await sendVisualizationDataForLocal(
          ctx,
          {
            mediaType,
            similarity: 1,
            details: { identical: true },
          },
          requestId,
        );
      }
      return;
    }

    if (mediaType === 'video' || mediaType === 'audio') {
      backgroundOwnsController = true;
      runLocalBackgroundComparison(ctx, mediaType, requestId, controller);
      return;
    }

    const result = await ctx.diffService.analyzeLocalFiles(
      ctx.fileUri,
      previousUri,
      {},
      (progress, stage) =>
        ctx.sendMessage({
          requestId,
          type: 'mediaDiff:progress',
          payload: { progress, stage },
        }),
      controller.signal,
    );
    controller.signal.throwIfAborted();
    ctx.lastDiffResult = result;
    ctx.sendMessage({ requestId, type: 'mediaDiff:result', payload: result });
    await sendVisualizationDataForLocal(ctx, result, requestId);
  } catch (error) {
    sendAnalysisFailure(ctx, controller, requestId, error);
  } finally {
    if (!backgroundOwnsController) ctx.requestState.clearAbortController(controller);
  }
}

function runBackgroundComparison(
  ctx: IHandlerContext,
  mediaType: 'video' | 'audio',
  previousPath: string,
  ref: string,
  requestId: string,
  controller: AbortController,
): void {
  void (async () => {
    try {
      startEarlyVisualization(ctx, mediaType, previousPath, controller.signal, requestId);
      const result = await ctx.diffService.analyze(
        ctx.fileUri,
        ref,
        comparisonOptions(ctx, previousPath),
        (progress, stage) =>
          ctx.sendMessage({
            requestId,
            type: 'mediaDiff:progress',
            payload: { progress, stage },
          }),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (ctx.isDisposed) return;
      ctx.lastDiffResult = result;
      ctx.sendMessage({ requestId, type: 'mediaDiff:result', payload: result });
      sendWaveformFromResult(ctx, result, requestId);
    } catch (error) {
      sendAnalysisFailure(ctx, controller, requestId, error);
    } finally {
      ctx.requestState.clearAbortController(controller);
    }
  })();
}

function runLocalBackgroundComparison(
  ctx: IHandlerContext,
  mediaType: 'video' | 'audio',
  requestId: string,
  controller: AbortController,
): void {
  const previousUri = ctx.previousUri;
  if (!previousUri) throw new Error('No previous file was selected for local comparison.');
  void (async () => {
    try {
      startEarlyVisualization(ctx, mediaType, previousUri.fsPath, controller.signal, requestId);
      const result = await ctx.diffService.analyzeLocalFiles(
        ctx.fileUri,
        previousUri,
        comparisonOptions(ctx),
        (progress, stage) =>
          ctx.sendMessage({
            requestId,
            type: 'mediaDiff:progress',
            payload: { progress, stage },
          }),
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (ctx.isDisposed) return;
      ctx.lastDiffResult = result;
      ctx.sendMessage({ requestId, type: 'mediaDiff:result', payload: result });
      sendWaveformFromResult(ctx, result, requestId);
    } catch (error) {
      sendAnalysisFailure(ctx, controller, requestId, error);
    } finally {
      ctx.requestState.clearAbortController(controller);
    }
  })();
}

function startEarlyVisualization(
  ctx: IHandlerContext,
  mediaType: 'video' | 'audio',
  previousPath: string,
  signal: AbortSignal,
  requestId: string,
): void {
  if (mediaType === 'audio') {
    void startEarlyWaveform(
      ctx,
      ctx.mediaRuntime,
      ctx.fileUri.fsPath,
      previousPath,
      signal,
      requestId,
    );
  } else {
    startEarlyFrameExtraction(
      ctx,
      ctx.mediaRuntime,
      ctx.fileUri.fsPath,
      previousPath,
      signal,
      requestId,
    );
  }
}

function comparisonOptions(ctx: IHandlerContext, previousPath?: string): DiffOptions {
  return {
    ...(previousPath ? { currentPath: ctx.fileUri.fsPath, previousPath } : {}),
    ...(ctx.timeRange.startTime === undefined ? {} : { startTime: ctx.timeRange.startTime }),
    ...(ctx.timeRange.endTime === undefined ? {} : { endTime: ctx.timeRange.endTime }),
  };
}

function sendAnalysisFailure(
  ctx: IHandlerContext,
  controller: AbortController,
  requestId: string,
  error: unknown,
): void {
  if (ctx.isDisposed) return;
  if (controller.signal.aborted) {
    ctx.sendMessage({ requestId, type: 'mediaDiff:cancelled' });
    return;
  }
  logger.error('Media comparison failed:', error);
  ctx.sendMessage({
    requestId,
    type: 'mediaDiff:error',
    error: error instanceof Error ? error.message : String(error),
  });
}

function requireMediaType(filePath: string): MediaType {
  const mediaType = getMediaType(filePath);
  if (!mediaType) throw new Error(`Unsupported media file type: ${filePath}`);
  return mediaType;
}

function requireRequestId(ctx: IHandlerContext): string {
  if (!ctx.currentRequestId) throw new Error('Media diff request identity is missing.');
  return ctx.currentRequestId;
}

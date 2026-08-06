import * as path from 'path';
import { createHash } from 'node:crypto';
import {
  createGeneratedAssetRevisionRef,
  type GeneratedAsset,
  type GeneratedAssetGenerationLineage,
  type GeneratedAudio,
  type GeneratedImage,
  type GeneratedVideo,
} from '@neko/generation';
import type { MediaGenerationRequestBase, MediaOutput } from '@neko/generation';

export type GeneratedMediaKind = 'image' | 'video' | 'audio';

export interface BuildGeneratedMediaAssetsInput {
  workspaceRoot: string;
  hostOutputPaths: readonly string[];
  outputs: readonly MediaOutput[];
  contentDigests: readonly string[];
  operationId: string;
  providerId?: string;
  mediaKind: GeneratedMediaKind;
  prompt?: string;
  model?: string;
  request?: Pick<MediaGenerationRequestBase, 'metadata'> & { readonly operation?: string };
  now?: () => string;
}

export function buildGeneratedMediaAssets(input: BuildGeneratedMediaAssetsInput): GeneratedAsset[] {
  const generatedAt = input.now?.() ?? new Date().toISOString();
  const assets: GeneratedAsset[] = [];
  const lineage = extractGeneratedAssetLineage(input.request?.metadata);
  const generation = extractGeneratedAssetGenerationLineage(input);

  for (let i = 0; i < input.hostOutputPaths.length; i++) {
    const hostOutputPath = input.hostOutputPaths[i];
    if (!hostOutputPath) continue;

    const output = input.outputs[i];
    const contentDigest = input.contentDigests[i];
    if (!contentDigest) {
      throw new Error(`Generated output ${i} is missing a content digest.`);
    }
    const assetId = createStableGeneratedOutputId(input.operationId, i, contentDigest);
    const mimeType = output?.mimeType ?? inferGeneratedMediaMimeType(hostOutputPath);
    const contentPath = toWorkspaceContentPath(input.workspaceRoot, hostOutputPath);
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId,
      contentDigest,
      contentPath,
      mediaKind: input.mediaKind,
      mimeType,
      generation,
    });
    const base = {
      id: assetId,
      path: hostOutputPath,
      mimeType,
      generatedAt,
      prompt: input.prompt,
      model: input.model,
      lifecycle,
      ...lineage,
    };
    const assetRef = {
      assetId: base.id,
      uri: toStableGeneratedAssetUri(hostOutputPath, base.id),
      mimeType: base.mimeType,
    };

    switch (input.mediaKind) {
      case 'image': {
        const width = output?.width ?? 1024;
        const height = output?.height ?? 1024;
        const asset: GeneratedImage = {
          ...base,
          assetRef,
          type: 'generated-image',
          width,
          height,
          ratio: computeAspectRatioLabel(width, height),
        };
        assets.push(asset);
        break;
      }
      case 'video': {
        const asset: GeneratedVideo = {
          ...base,
          assetRef,
          type: 'generated-video',
          duration: output?.duration ?? 0,
          width: output?.width ?? 1280,
          height: output?.height ?? 720,
          fps: 24,
        };
        assets.push(asset);
        break;
      }
      case 'audio': {
        const asset: GeneratedAudio = {
          ...base,
          assetRef,
          type: 'generated-audio',
          duration: output?.duration ?? 0,
          sampleRate: 44100,
          channels: 2,
        };
        assets.push(asset);
        break;
      }
    }
  }

  return assets;
}

function toWorkspaceContentPath(workspaceRoot: string, hostOutputPath: string): string {
  const relativePath = path.relative(workspaceRoot, hostOutputPath).replace(/\\/gu, '/');
  if (
    !relativePath ||
    relativePath.startsWith('../') ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Generated output is outside the workspace: ${hostOutputPath}`);
  }
  return relativePath;
}

export function createStableGeneratedOutputId(
  operationId: string,
  outputIndex: number,
  contentDigest: string,
): string {
  const digest = createHash('sha256')
    .update(`${operationId}\0${outputIndex}\0${contentDigest}`)
    .digest('hex')
    .slice(0, 24);
  return `generated-${digest}`;
}

export function toStableGeneratedAssetUri(filePath: string, assetId?: string): string {
  const extension = path.extname(filePath);
  return `generated-assets/${assetId ?? path.basename(filePath)}${assetId ? extension : ''}`;
}

export function inferGeneratedMediaMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
  };
  return mimeTypes[extension] ?? 'application/octet-stream';
}

export function computeAspectRatioLabel(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function extractGeneratedAssetLineage(
  metadata: Record<string, unknown> | undefined,
): Pick<
  GeneratedAsset,
  'characterIds' | 'sourceNodeId' | 'sourceCueId' | 'speakerEntityId' | 'voiceAssetId'
> {
  if (!metadata) return {};

  const sourceNodeId =
    typeof metadata['sourceNodeId'] === 'string' ? metadata['sourceNodeId'] : undefined;
  const sourceCueId =
    typeof metadata['sourceCueId'] === 'string' ? metadata['sourceCueId'] : undefined;
  const speakerEntityId =
    typeof metadata['speakerEntityId'] === 'string' ? metadata['speakerEntityId'] : undefined;
  const voiceAssetId =
    typeof metadata['voiceAssetId'] === 'string' ? metadata['voiceAssetId'] : undefined;
  const characterIds = Array.isArray(metadata['characterIds'])
    ? metadata['characterIds'].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
    : undefined;

  return {
    sourceNodeId,
    sourceCueId,
    speakerEntityId,
    voiceAssetId,
    characterIds: characterIds && characterIds.length > 0 ? characterIds : undefined,
  };
}

function extractGeneratedAssetGenerationLineage(
  input: Pick<BuildGeneratedMediaAssetsInput, 'operationId' | 'providerId' | 'model' | 'request'>,
): GeneratedAssetGenerationLineage {
  const metadata = input.request?.metadata;
  const workflowStage = readWorkflowStage(metadata);
  return {
    operationId: input.operationId,
    ...(readMetadataString(metadata, 'runId')
      ? { runId: readMetadataString(metadata, 'runId') }
      : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.model ? { modelId: input.model } : {}),
    ...(workflowStage ? { workflowStage } : {}),
  };
}

function readWorkflowStage(
  metadata: Record<string, unknown> | undefined,
): GeneratedAssetGenerationLineage['workflowStage'] | undefined {
  const stageId =
    readMetadataString(metadata, 'workflowStageId') ?? readMetadataString(metadata, 'stageId');
  if (!stageId) return undefined;
  const workflowId = readMetadataString(metadata, 'workflowId');
  return {
    stageId,
    ...(workflowId ? { workflowId } : {}),
  };
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

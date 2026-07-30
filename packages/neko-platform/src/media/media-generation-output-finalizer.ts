import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { MediaGenerationRequestBase, MediaOutput } from '@neko/generation';
import type { GeneratedAsset } from '@neko/shared';
import { downloadMediaOutputs, type DownloadMediaOptions } from './media-file-downloader';
import { buildGeneratedMediaAssets, type GeneratedMediaKind } from './media-generated-asset';

export interface GeneratedAssetSink {
  add(asset: GeneratedAsset): void | Promise<void>;
  remove(id: string): boolean | Promise<boolean>;
}

export interface FinalizedMediaGenerationOutputs {
  resultUrls: string[];
  thumbnailUrl?: string;
  hostOutputPaths: string[];
  generatedAssets: GeneratedAsset[];
}

export interface FinalizeMediaGenerationOutputsInput {
  readonly workspaceRoot: string;
  readonly operationId: string;
  readonly generationType: string;
  readonly mediaKind: GeneratedMediaKind;
  readonly outputs: readonly MediaOutput[];
  readonly providerId: string;
  readonly modelId: string;
  readonly request: MediaGenerationRequestBase;
  readonly outputDir: string;
  readonly transcodeFile?: DownloadMediaOptions['transcodeFile'];
  readonly assetIndex: GeneratedAssetSink;
  readonly computeContentDigest?: (filePath: string) => Promise<string>;
  readonly logger?: {
    info?(message: string, details?: unknown): void;
    warn?(message: string, details?: unknown): void;
  };
}

export async function finalizeMediaGenerationOutputs(
  input: FinalizeMediaGenerationOutputsInput,
): Promise<FinalizedMediaGenerationOutputs> {
  if (!input.operationId.trim()) {
    throw new Error('Media generation output finalization requires an operationId.');
  }
  if (input.outputs.length === 0) {
    throw new Error('Media generation completed without outputs.');
  }

  const indexedAssetIds: string[] = [];
  try {
    const hostOutputPaths = await downloadMediaOutputs(
      input.operationId,
      input.generationType,
      [...input.outputs],
      input.outputDir,
      input.transcodeFile ? { transcodeFile: input.transcodeFile } : {},
    );
    if (hostOutputPaths.length === 0) {
      throw new Error('Generated output materialization returned no workspace files.');
    }
    const computeContentDigest = input.computeContentDigest ?? computeFileContentDigest;
    const contentDigests = await Promise.all(hostOutputPaths.map(computeContentDigest));
    const generatedAssets = buildGeneratedMediaAssets({
      workspaceRoot: input.workspaceRoot,
      hostOutputPaths,
      contentDigests,
      operationId: input.operationId,
      providerId: input.providerId,
      outputs: [...input.outputs],
      mediaKind: input.mediaKind,
      prompt: input.request.prompt,
      model: input.modelId,
      request: input.request,
    });
    for (const asset of generatedAssets) {
      await input.assetIndex.add(asset);
      indexedAssetIds.push(asset.id);
    }
    return {
      resultUrls: generatedAssets
        .map((asset) => asset.assetRef?.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
      thumbnailUrl: generatedAssets[0]?.assetRef?.uri,
      hostOutputPaths,
      generatedAssets,
    };
  } catch (error) {
    for (const assetId of indexedAssetIds.reverse()) {
      await Promise.resolve(input.assetIndex.remove(assetId)).catch(() => false);
    }
    input.logger?.warn?.('Failed to persist generated media outputs', error);
    throw error;
  }
}

async function computeFileContentDigest(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  return `sha256:${hash.digest('hex')}`;
}

import type {
  PluginTransferAssetRef,
  PluginTransferCommandPlan,
  PluginTransferPayload,
} from '@neko-agent/types';
import { isDocumentArchiveResourceRef, type DocumentArchiveResourceRef } from '@neko/shared';

type NekoSuitePluginTransferBuildPayload = Exclude<PluginTransferPayload, { kind: 'assetBatch' }>;

export interface BuildNekoSuitePluginTransferPlanInput {
  readonly target: string;
  readonly assetPath?: string;
  readonly mediaType?: string;
  readonly payload?: NekoSuitePluginTransferBuildPayload;
}

export function buildNekoSuitePluginTransferPlan(
  input: BuildNekoSuitePluginTransferPlanInput,
): PluginTransferCommandPlan {
  const payload =
    input.payload ??
    (input.assetPath
      ? {
          kind: 'singleAsset' as const,
          asset: {
            path: input.assetPath,
            ...(isPluginTransferMediaType(input.mediaType) ? { mediaType: input.mediaType } : {}),
          },
        }
      : undefined);

  if (!payload) {
    return { status: 'unsupported', target: input.target };
  }

  if (payload.kind === 'cutStoryboard') {
    if (input.target === 'cut') {
      return {
        status: 'unsupported',
        target: input.target,
        reason: 'cut-otio-target-not-registered',
      };
    }
    return { status: 'unsupported', target: input.target, reason: 'unsupported-structured-target' };
  }

  assertSingleTransferPayload(payload);

  if (input.target === 'canvas') {
    const documentResourceRef = readDocumentResourceRef(payload.asset, payload.provenance);
    return {
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: {
        ...(payload.asset.path ? { path: payload.asset.path } : {}),
        ...(payload.asset.mediaType ? { type: payload.asset.mediaType } : {}),
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
        ...(payload.asset.resourceRef ? { resourceRef: payload.asset.resourceRef } : {}),
        ...((payload.target ?? payload.asset.target)
          ? { target: payload.target ?? payload.asset.target }
          : {}),
        ...((payload.provenance ?? payload.asset.provenance)
          ? { provenance: payload.provenance ?? payload.asset.provenance }
          : {}),
      },
    };
  }

  if (!payload.asset.path) {
    return {
      status: 'unsupported',
      target: input.target,
      reason: 'asset-path-required',
    };
  }

  if (input.target === 'cut') {
    return {
      status: 'unsupported',
      target: input.target,
      reason: 'cut-otio-target-not-registered',
    };
  }

  if (input.target === 'explorer') {
    return {
      status: 'reveal-file',
      filePath: payload.asset.path,
    };
  }

  return { status: 'unsupported', target: input.target };
}

function assertSingleTransferPayload(
  payload: NekoSuitePluginTransferBuildPayload,
): asserts payload is Extract<PluginTransferPayload, { kind: 'singleAsset' }> {
  if (payload.kind !== 'singleAsset') {
    throw new Error(`Unsupported plugin transfer payload kind: ${payload.kind}`);
  }
}

function isPluginTransferMediaType(
  value: string | undefined,
): value is 'image' | 'video' | 'audio' | 'model' {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'model';
}

function readDocumentResourceRef(
  asset: PluginTransferAssetRef,
  payloadProvenance: PluginTransferAssetRef['provenance'] | undefined,
): DocumentArchiveResourceRef | undefined {
  const candidates = [
    asset.documentResourceRef,
    asset.provenance?.metadata?.['documentResourceRef'],
    payloadProvenance?.metadata?.['documentResourceRef'],
  ];
  return candidates.find(isDocumentArchiveResourceRef);
}

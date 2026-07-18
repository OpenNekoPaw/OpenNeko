import type {
  PluginTransferAssetRef,
  PluginTransferCommandPlan,
  PluginTransferPayload,
  PluginTransferTargetRef,
} from '@neko-agent/types';
import {
  isDocumentArchiveResourceRef,
  type DocumentArchiveResourceRef,
  type NekoProjectAuthoringTarget,
} from '@neko/shared';

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
      const target = readAuthoringTarget(payload.target);
      if (!isExplicitCutTarget(target)) {
        return {
          status: 'unsupported',
          target: input.target,
          reason: 'explicit-cut-target-required',
        };
      }
      const expectedProjectRevision = readExpectedProjectRevision(payload.target);
      if (target.kind === 'file' && !expectedProjectRevision) {
        return {
          status: 'unsupported',
          target: input.target,
          reason: 'cut-project-revision-required',
        };
      }
      return {
        status: 'execute-command',
        command: 'neko.cut.authoring.importStoryboard',
        payload: {
          ...payload.storyboard,
          ...(target ? { target } : {}),
          ...(expectedProjectRevision ? { expectedProjectRevision } : {}),
          ...(target?.reveal !== undefined ? { reveal: target.reveal } : {}),
          ...(payload.provenance ? { provenance: payload.provenance } : {}),
        },
      };
    }
    return { status: 'unsupported', target: input.target, reason: 'unsupported-structured-target' };
  }

  assertSingleTransferPayload(payload);
  const transferTarget = payload.target ?? payload.asset.target;
  const authoringTarget = readAuthoringTarget(transferTarget);
  const provenance = payload.provenance ?? payload.asset.provenance;

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
    if (!isExplicitCutTarget(authoringTarget)) {
      return {
        status: 'unsupported',
        target: input.target,
        reason: 'explicit-cut-target-required',
      };
    }
    const expectedProjectRevision = readExpectedProjectRevision(transferTarget);
    if (authoringTarget.kind === 'file' && !expectedProjectRevision) {
      return {
        status: 'unsupported',
        target: input.target,
        reason: 'cut-project-revision-required',
      };
    }
    return {
      status: 'execute-command',
      command: 'neko.cut.authoring.importGeneratedClip',
      payload: {
        assetPath: payload.asset.path,
        ...(payload.asset.mediaType ? { mediaType: payload.asset.mediaType } : {}),
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
        ...(authoringTarget ? { target: authoringTarget } : {}),
        ...(expectedProjectRevision ? { expectedProjectRevision } : {}),
        ...(authoringTarget?.reveal !== undefined ? { reveal: authoringTarget.reveal } : {}),
        ...(provenance ? { provenance } : {}),
      },
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

function isExplicitCutTarget(
  target: NekoProjectAuthoringTarget | undefined,
): target is NekoProjectAuthoringTarget & {
  readonly kind: 'file' | 'new';
  readonly documentUri: string;
} {
  return (
    (target?.kind === 'file' || target?.kind === 'new') &&
    typeof target.documentUri === 'string' &&
    target.documentUri.trim().length > 0
  );
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

function readAuthoringTarget(
  target: PluginTransferTargetRef | undefined,
): NekoProjectAuthoringTarget | undefined {
  if (!target) return undefined;
  const kind = readAuthoringTargetKind(target.kind);
  const reveal = typeof target.reveal === 'boolean' ? target.reveal : undefined;
  if (!kind && !target.documentUri && !target.title && reveal === undefined) return undefined;
  return {
    ...(kind ? { kind } : {}),
    ...(target.documentUri ? { documentUri: target.documentUri } : {}),
    ...(target.title ? { title: target.title } : {}),
    ...(reveal !== undefined ? { reveal } : {}),
  };
}

function readExpectedProjectRevision(
  target: PluginTransferTargetRef | undefined,
): string | undefined {
  const revision = target?.expectedProjectRevision;
  return typeof revision === 'string' && revision.trim().length > 0 ? revision : undefined;
}

function readAuthoringTargetKind(value: unknown): NekoProjectAuthoringTarget['kind'] | undefined {
  return value === 'active' || value === 'file' || value === 'new' ? value : undefined;
}

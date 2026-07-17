import type { RenderFrameMeta, ViewportFrameMeta, ViewportSerializableRecord } from '@neko/shared';

const IDENTITY_VIEW_TRANSFORM = [1, 0, 0, 1, 0, 0] as const;

export function bridgeRenderFrameMetaToViewportFrameMeta(
  frame: RenderFrameMeta,
  fallbackSceneId: string,
): ViewportFrameMeta {
  const projection = parseProjectionJson(frame.projectionJson);
  return {
    protocolVersion: 1,
    streamId: frame.streamId,
    sceneId: frame.sceneId ?? fallbackSceneId,
    viewportId: frame.viewportId,
    frameId: frame.frameId,
    ptsUs: frame.ptsUs,
    durationUs: frame.durationUs,
    frameTimestamp: frame.frameTimestamp || frame.ptsUs / 1000,
    revision: frame.sceneRevision,
    sceneRevision: frame.sceneRevision,
    appliedSeq: frame.appliedSeq,
    viewTransform: normalizeViewTransform(frame.viewTransform),
    projection,
    diagnostics: frame.diagnostics as ViewportSerializableRecord | undefined,
  };
}

function normalizeViewTransform(
  value: readonly number[] | undefined,
): ViewportFrameMeta['viewTransform'] {
  if (Array.isArray(value) && value.length === 6 && value.every((item) => Number.isFinite(item))) {
    const [a, b, c, d, tx, ty] = value as [number, number, number, number, number, number];
    return [a, b, c, d, tx, ty];
  }
  return IDENTITY_VIEW_TRANSFORM;
}

function parseProjectionJson(value: string | undefined): ViewportSerializableRecord | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed as ViewportSerializableRecord;
  } catch {
    return { raw: value };
  }
  return { raw: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type { ViewportFrameMeta, ViewportOverlayDescriptor } from '@neko/shared';
import { applyViewportTransform } from './viewport-state';

export type ViewportOverlayDiagnosticCode =
  | 'missing-frame-meta'
  | 'viewport-mismatch'
  | 'scene-mismatch'
  | 'revision-mismatch'
  | 'applied-seq-ahead';

export interface ViewportOverlayDiagnostic {
  readonly code: ViewportOverlayDiagnosticCode;
  readonly overlayId: string;
  readonly message: string;
}

export interface OverlayAlignmentSample {
  readonly overlayId: string;
  readonly source: readonly [number, number];
  readonly screen: readonly [number, number];
}

export function collectOverlayDiagnostics(
  overlays: readonly ViewportOverlayDescriptor[],
  frameMeta: ViewportFrameMeta | null,
): readonly ViewportOverlayDiagnostic[] {
  const diagnostics: ViewportOverlayDiagnostic[] = [];
  for (const overlay of overlays) {
    diagnostics.push(...diagnoseOverlayDescriptor(overlay, frameMeta));
  }
  return diagnostics;
}

export function diagnoseOverlayDescriptor(
  overlay: ViewportOverlayDescriptor,
  frameMeta: ViewportFrameMeta | null,
): readonly ViewportOverlayDiagnostic[] {
  if (frameMeta === null) {
    return overlay.authoritative === true
      ? [
          {
            code: 'missing-frame-meta',
            overlayId: overlay.id,
            message: `Overlay ${overlay.id} requires frame metadata before it can be authoritative.`,
          },
        ]
      : [];
  }

  const diagnostics: ViewportOverlayDiagnostic[] = [];
  if (overlay.viewportId !== frameMeta.viewportId) {
    diagnostics.push({
      code: 'viewport-mismatch',
      overlayId: overlay.id,
      message: `Overlay ${overlay.id} targets viewport ${overlay.viewportId}, but frame belongs to ${frameMeta.viewportId}.`,
    });
  }
  if (overlay.sceneId !== undefined && overlay.sceneId !== frameMeta.sceneId) {
    diagnostics.push({
      code: 'scene-mismatch',
      overlayId: overlay.id,
      message: `Overlay ${overlay.id} targets scene ${overlay.sceneId}, but frame belongs to ${frameMeta.sceneId}.`,
    });
  }
  if (overlay.revision !== undefined && overlay.revision !== frameMeta.revision) {
    diagnostics.push({
      code: 'revision-mismatch',
      overlayId: overlay.id,
      message: `Overlay ${overlay.id} revision ${overlay.revision} does not match frame revision ${frameMeta.revision}.`,
    });
  }
  if (overlay.appliedSeq !== undefined && overlay.appliedSeq > frameMeta.appliedSeq) {
    diagnostics.push({
      code: 'applied-seq-ahead',
      overlayId: overlay.id,
      message: `Overlay ${overlay.id} requires applied sequence ${overlay.appliedSeq}, but frame has ${frameMeta.appliedSeq}.`,
    });
  }
  return diagnostics;
}

export function projectOverlayPointForFrame(
  overlay: Pick<ViewportOverlayDescriptor, 'coordinateSpace' | 'id'>,
  point: readonly [number, number],
  frameMeta: ViewportFrameMeta | null,
): readonly [number, number] {
  if (frameMeta && (overlay.coordinateSpace === 'world' || overlay.coordinateSpace === 'scene')) {
    return applyViewportTransform(frameMeta.viewTransform, point);
  }
  return point;
}

export function createOverlayAlignmentSamples(
  overlay: ViewportOverlayDescriptor,
  frameMeta: ViewportFrameMeta | null,
): readonly OverlayAlignmentSample[] {
  const points = readOverlayPoints(overlay);
  return points.map((source) => ({
    overlayId: overlay.id,
    source,
    screen: projectOverlayPointForFrame(overlay, source, frameMeta),
  }));
}

function readOverlayPoints(
  overlay: ViewportOverlayDescriptor,
): readonly (readonly [number, number])[] {
  const points = overlay.payload['points'];
  if (Array.isArray(points)) {
    const result: Array<readonly [number, number]> = [];
    for (const point of points) {
      if (isVec2(point)) {
        result.push(point);
      }
    }
    return result;
  }

  const position = overlay.payload['position'];
  if (isVec2(position)) {
    return [position];
  }

  const rect = overlay.payload['rect'];
  if (Array.isArray(rect) && rect.length === 4 && rect.every((item) => typeof item === 'number')) {
    const [x, y, width, height] = rect as [number, number, number, number];
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ];
  }

  const screenPosition = overlay.payload['screenPosition'];
  if (isVec2(screenPosition)) {
    return [screenPosition];
  }

  return [];
}

function isVec2(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

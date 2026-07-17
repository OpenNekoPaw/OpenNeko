import React, { useEffect, useMemo, useRef } from 'react';
import type {
  ViewportFrameMeta,
  ViewportOverlayDescriptor,
  ViewportSerializableRecord,
  ViewportVec2,
} from '@neko/shared';
import { applyViewportTransform } from './viewport-state';

type OverlayCanvasContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'arc'
  | 'rect'
  | 'strokeRect'
  | 'fillText'
  | 'save'
  | 'restore'
> & {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  setLineDash?(segments: number[]): void;
};

export interface OverlayRendererProps {
  readonly frameMeta: ViewportFrameMeta | null;
  readonly overlays: readonly ViewportOverlayDescriptor[];
  readonly className?: string;
  readonly onStaleOverlay?: (overlay: ViewportOverlayDescriptor) => void;
}

export function OverlayRenderer({
  frameMeta,
  overlays,
  className,
  onStaleOverlay,
}: OverlayRendererProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sorted = useMemo(() => sortOverlayDescriptors(overlays), [overlays]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.save();
    context.scale(pixelRatio, pixelRatio);

    const fresh = sorted.filter((overlay) => {
      const isFresh = isOverlayDescriptorFresh(overlay, frameMeta);
      if (!isFresh) onStaleOverlay?.(overlay);
      return isFresh || overlay.stalePolicy === 'draw-as-prediction';
    });
    drawOverlayDescriptors(context, fresh, frameMeta);
    context.restore();
  }, [frameMeta, onStaleOverlay, sorted]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? 'neko-viewport-overlay'}
      data-neko-viewport-overlay="true"
      aria-hidden="true"
    />
  );
}

export function sortOverlayDescriptors(
  overlays: readonly ViewportOverlayDescriptor[],
): readonly ViewportOverlayDescriptor[] {
  return [...overlays].sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
}

export function isOverlayDescriptorFresh(
  overlay: ViewportOverlayDescriptor,
  frameMeta: ViewportFrameMeta | null,
): boolean {
  if (frameMeta === null) return overlay.authoritative !== true;
  if (overlay.viewportId !== frameMeta.viewportId) return false;
  if (overlay.sceneId !== undefined && overlay.sceneId !== frameMeta.sceneId) return false;
  if (overlay.revision !== undefined && overlay.revision !== frameMeta.revision) return false;
  if (overlay.appliedSeq !== undefined && overlay.appliedSeq > frameMeta.appliedSeq) return false;
  return true;
}

export function drawOverlayDescriptors(
  context: OverlayCanvasContext,
  overlays: readonly ViewportOverlayDescriptor[],
  frameMeta: ViewportFrameMeta | null,
): void {
  for (const overlay of overlays) {
    context.save();
    applyStyle(context, overlay);
    drawOverlayDescriptor(context, overlay, frameMeta);
    context.restore();
  }
}

function drawOverlayDescriptor(
  context: OverlayCanvasContext,
  overlay: ViewportOverlayDescriptor,
  frameMeta: ViewportFrameMeta | null,
): void {
  if (overlay.kind === 'polyline') {
    const points = readPoints(overlay.payload);
    if (points.length < 2) return;
    context.beginPath();
    const first = mapOverlayPoint(overlay, points[0]!, frameMeta);
    context.moveTo(first[0], first[1]);
    for (const point of points.slice(1)) {
      const mapped = mapOverlayPoint(overlay, point, frameMeta);
      context.lineTo(mapped[0], mapped[1]);
    }
    context.stroke();
    return;
  }

  if (overlay.kind === 'points') {
    for (const point of readPoints(overlay.payload)) {
      const mapped = mapOverlayPoint(overlay, point, frameMeta);
      context.beginPath();
      context.arc(mapped[0], mapped[1], readNumber(overlay.payload, 'radius', 3), 0, Math.PI * 2);
      context.fill();
    }
    return;
  }

  if (overlay.kind === 'rect') {
    const rect = readRect(overlay.payload);
    if (!rect) return;
    const origin = mapOverlayPoint(overlay, [rect[0], rect[1]], frameMeta);
    context.strokeRect(origin[0], origin[1], rect[2], rect[3]);
    return;
  }

  if (overlay.kind === 'text') {
    const position = readPoint(overlay.payload['position']);
    const text = typeof overlay.payload['text'] === 'string' ? overlay.payload['text'] : '';
    if (!position || !text) return;
    const mapped = mapOverlayPoint(overlay, position, frameMeta);
    context.fillText(text, mapped[0], mapped[1]);
  }
}

function mapOverlayPoint(
  overlay: ViewportOverlayDescriptor,
  point: ViewportVec2,
  frameMeta: ViewportFrameMeta | null,
): ViewportVec2 {
  if (frameMeta && (overlay.coordinateSpace === 'world' || overlay.coordinateSpace === 'scene')) {
    return applyViewportTransform(frameMeta.viewTransform, point);
  }
  return point;
}

function applyStyle(context: OverlayCanvasContext, overlay: ViewportOverlayDescriptor): void {
  context.strokeStyle = overlay.style?.stroke ?? 'rgba(96, 165, 250, 0.9)';
  context.fillStyle = overlay.style?.fill ?? overlay.style?.stroke ?? 'rgba(96, 165, 250, 0.9)';
  context.lineWidth = overlay.style?.lineWidth ?? 1.5;
  context.globalAlpha = overlay.style?.opacity ?? 1;
  context.setLineDash?.([...(overlay.style?.dash ?? [])]);
}

function readPoints(payload: ViewportSerializableRecord): ViewportVec2[] {
  const points = payload['points'];
  return Array.isArray(points)
    ? points.map(readPoint).filter((point): point is ViewportVec2 => point !== null)
    : [];
}

function readPoint(value: unknown): ViewportVec2 | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
    ? [value[0], value[1]]
    : null;
}

function readRect(
  payload: ViewportSerializableRecord,
): readonly [number, number, number, number] | null {
  const rect = payload['rect'];
  if (Array.isArray(rect) && rect.length === 4 && rect.every((item) => typeof item === 'number')) {
    const [x, y, width, height] = rect as [number, number, number, number];
    return [x, y, width, height];
  }
  return null;
}

function readNumber(payload: ViewportSerializableRecord, key: string, fallback: number): number {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

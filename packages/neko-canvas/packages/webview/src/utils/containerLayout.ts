import type { CanvasNode } from '@neko/shared';
import { getContainerChildIds } from '@neko/shared';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindFreePositionOptions {
  preferred: { x: number; y: number };
  size: { width: number; height: number };
  nodes: CanvasNode[];
  ignoreNodeIds?: string[];
  gap?: number;
  maxRings?: number;
}

export interface AutoArrangeContainerOptions {
  containerId: string;
  mode?: 'grid' | 'sequence' | 'stack' | 'table' | 'gallery';
  paddingX?: number;
  paddingTop?: number;
  gapX?: number;
  gapY?: number;
  minColumnWidth?: number;
  resizeChildren?: boolean;
}

const DEFAULT_GAP = 24;

export function findFreePosition({
  preferred,
  size,
  nodes,
  ignoreNodeIds = [],
  gap = DEFAULT_GAP,
  maxRings = 12,
}: FindFreePositionOptions): { x: number; y: number } {
  const ignored = new Set(ignoreNodeIds);
  const occupied = nodes
    .filter((node) => !ignored.has(node.id))
    .map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    }));

  if (!overlapsAny({ ...preferred, ...size }, occupied, gap)) {
    return preferred;
  }

  for (let ring = 1; ring <= maxRings; ring++) {
    const stepX = size.width + gap;
    const stepY = size.height + gap;
    const candidates = [
      { x: preferred.x + ring * stepX, y: preferred.y },
      { x: preferred.x, y: preferred.y + ring * stepY },
      { x: preferred.x - ring * stepX, y: preferred.y },
      { x: preferred.x, y: preferred.y - ring * stepY },
      { x: preferred.x + ring * stepX, y: preferred.y + ring * stepY },
      { x: preferred.x - ring * stepX, y: preferred.y + ring * stepY },
      { x: preferred.x + ring * stepX, y: preferred.y - ring * stepY },
      { x: preferred.x - ring * stepX, y: preferred.y - ring * stepY },
    ];

    const free = candidates.find(
      (candidate) => !overlapsAny({ ...candidate, ...size }, occupied, gap),
    );
    if (free) {
      return free;
    }
  }

  return {
    x: preferred.x + (size.width + gap) * (maxRings + 1),
    y: preferred.y,
  };
}

export function autoArrangeContainer(
  nodes: CanvasNode[],
  {
    containerId,
    mode = 'grid',
    paddingX = 24,
    paddingTop = 64,
    gapX = 24,
    gapY = 24,
    minColumnWidth = 220,
    resizeChildren = false,
  }: AutoArrangeContainerOptions,
): CanvasNode[] {
  const container = nodes.find((node) => node.id === containerId);
  if (!container) {
    return nodes;
  }

  const childIds = getContainerChildIds(container);
  if (childIds.length === 0) {
    return nodes;
  }

  const orderedChildren = childIds
    .map((childId) => nodes.find((node) => node.id === childId))
    .filter((node): node is CanvasNode => Boolean(node));
  if (orderedChildren.length === 0) {
    return nodes;
  }

  const layout = container.container?.layout;
  const availableWidth = Math.max(container.size.width - paddingX * 2, minColumnWidth);
  const maxChildWidth = Math.max(...orderedChildren.map((child) => child.size.width));

  const galleryData =
    container.type === 'gallery' ? (container.data as { cols?: number }) : undefined;

  const columns =
    mode === 'gallery'
      ? Math.max(1, galleryData?.cols ?? 3)
      : mode === 'table'
        ? Math.max(1, layout?.columns ?? 3)
        : mode === 'sequence'
          ? Math.max(1, Math.floor((availableWidth + gapX) / (maxChildWidth + gapX)))
          : mode === 'stack'
            ? 1
            : Math.max(1, Math.floor((availableWidth + gapX) / (maxChildWidth + gapX)));

  const computedCellWidth =
    mode === 'table'
      ? (layout?.columnWidth ?? 200)
      : resizeChildren
        ? Math.floor((availableWidth - (columns - 1) * gapX) / columns)
        : undefined;
  const computedCellHeight =
    mode === 'table' ? (layout?.rowHeight ?? 120) : (computedCellWidth ?? undefined);

  const positionById = new Map<string, { x: number; y: number }>();
  const sizeById = new Map<string, { width: number; height: number }>();
  orderedChildren.forEach((child, index) => {
    if (layout?.lockedChildIds?.includes(child.id)) {
      return;
    }

    const col = index % columns;
    const row = Math.floor(index / columns);
    const stepX = computedCellWidth ?? child.size.width;
    const stepY = computedCellHeight ?? child.size.height;
    const preferred = {
      x: container.position.x + paddingX + col * (stepX + gapX),
      y: container.position.y + paddingTop + row * (stepY + gapY),
    };
    positionById.set(child.id, preferred);

    if (resizeChildren && computedCellWidth !== undefined && computedCellHeight !== undefined) {
      sizeById.set(child.id, { width: computedCellWidth, height: computedCellHeight });
    }
  });

  return nodes.map((node) => {
    const position = positionById.get(node.id);
    const size = sizeById.get(node.id);
    if (position && size) return { ...node, position, size };
    if (position) return { ...node, position };
    return node;
  });
}

export function computeContainerChildSize(
  container: CanvasNode,
  options?: { paddingX?: number; gapX?: number },
): { width: number; height: number } | undefined {
  const paddingX = options?.paddingX ?? 24;
  const gapX = options?.gapX ?? 8;
  const galleryData =
    container.type === 'gallery' ? (container.data as { cols?: number }) : undefined;
  const columns = Math.max(1, galleryData?.cols ?? container.container?.layout?.columns ?? 3);
  const availableWidth = Math.max(container.size.width - paddingX * 2, 60);
  const cellWidth = Math.floor((availableWidth - (columns - 1) * gapX) / columns);
  const cellHeight = cellWidth;
  return { width: cellWidth, height: cellHeight };
}

function overlapsAny(rect: Rect, occupied: Rect[], gap: number): boolean {
  return occupied.some((other) => rectanglesOverlap(rect, other, gap));
}

function rectanglesOverlap(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

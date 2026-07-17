/**
 * Viewport Culling - 视口裁剪工具
 * 只渲染可见区域内的节点，提升大规模内容下的性能
 */

import type { CanvasNode, CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CullingResult {
  visibleNodes: CanvasNode[];
  culledCount: number;
  totalCount: number;
}

// =============================================================================
// Constants
// =============================================================================

/** 视口边缘缓冲区（像素），防止节点在边缘闪烁 */
export const VIEWPORT_BUFFER = 100;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * 计算视口在画布坐标系中的可见边界
 */
export function getViewportBounds(
  viewport: CanvasViewport,
  containerWidth: number,
  containerHeight: number,
  buffer: number = VIEWPORT_BUFFER,
): ViewportBounds {
  const { pan, zoom } = viewport;

  // 将屏幕坐标转换为画布坐标
  // 屏幕坐标 (0, 0) 对应画布坐标 (-pan.x / zoom, -pan.y / zoom)
  const left = (-pan.x - buffer) / zoom;
  const top = (-pan.y - buffer) / zoom;
  const right = (containerWidth - pan.x + buffer) / zoom;
  const bottom = (containerHeight - pan.y + buffer) / zoom;

  return { left, top, right, bottom };
}

/**
 * 检查节点是否在视口边界内
 */
export function isNodeVisible(node: CanvasNode, viewportBounds: ViewportBounds): boolean {
  const { position, size } = node;

  // 节点边界
  const nodeLeft = position.x;
  const nodeTop = position.y;
  const nodeRight = position.x + size.width;
  const nodeBottom = position.y + size.height;

  // AABB 碰撞检测
  return !(
    nodeRight < viewportBounds.left ||
    nodeLeft > viewportBounds.right ||
    nodeBottom < viewportBounds.top ||
    nodeTop > viewportBounds.bottom
  );
}

/**
 * 过滤出可见节点
 */
export function cullNodes(
  nodes: CanvasNode[],
  viewport: CanvasViewport,
  containerWidth: number,
  containerHeight: number,
): CullingResult {
  const viewportBounds = getViewportBounds(viewport, containerWidth, containerHeight);

  const visibleNodes = nodes.filter((node) => isNodeVisible(node, viewportBounds));

  return {
    visibleNodes,
    culledCount: nodes.length - visibleNodes.length,
    totalCount: nodes.length,
  };
}

/**
 * 计算所有节点的边界框
 */
export function getNodesBounds(nodes: CanvasNode[]): Bounds | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * 计算适应内容的视口参数
 */
export function calculateFitViewport(
  bounds: Bounds,
  containerWidth: number,
  containerHeight: number,
  padding: number = 50,
  minZoom: number = 0.05,
  maxZoom: number = 16,
): CanvasViewport {
  if (bounds.width === 0 || bounds.height === 0) {
    return { pan: { x: 0, y: 0 }, zoom: 1 };
  }

  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  const scaleX = availableWidth / bounds.width;
  const scaleY = availableHeight / bounds.height;
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(scaleX, scaleY)));

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  const panX = containerWidth / 2 - centerX * zoom;
  const panY = containerHeight / 2 - centerY * zoom;

  return { pan: { x: panX, y: panY }, zoom };
}

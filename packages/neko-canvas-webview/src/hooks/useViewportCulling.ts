/**
 * useViewportCulling - 视口裁剪 Hook
 * 自动过滤出可见区域内的节点，优化渲染性能
 */

import { useMemo } from 'react';
import type { CanvasNode, CanvasViewport } from '@neko/shared';
import { cullNodes, type CullingResult } from '../utils/viewportCulling';

// =============================================================================
// Types
// =============================================================================

export interface UseViewportCullingOptions {
  nodes: CanvasNode[];
  viewport: CanvasViewport;
  containerWidth: number;
  containerHeight: number;
  /** 是否启用裁剪（调试用） */
  enabled?: boolean;
}

export interface UseViewportCullingReturn extends CullingResult {
  /** 裁剪是否启用 */
  enabled: boolean;
}

// =============================================================================
// Hook
// =============================================================================

export function useViewportCulling({
  nodes,
  viewport,
  containerWidth,
  containerHeight,
  enabled = true,
}: UseViewportCullingOptions): UseViewportCullingReturn {
  const result = useMemo(() => {
    if (!enabled || containerWidth === 0 || containerHeight === 0) {
      return {
        visibleNodes: nodes,
        culledCount: 0,
        totalCount: nodes.length,
      };
    }

    return cullNodes(nodes, viewport, containerWidth, containerHeight);
  }, [nodes, viewport, containerWidth, containerHeight, enabled]);

  return {
    ...result,
    enabled,
  };
}

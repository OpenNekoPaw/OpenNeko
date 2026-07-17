/**
 * Snap Engine - 吸附系统
 * 提供网格吸附、节点边缘吸附、中心点对齐等功能
 */

import type { CanvasNode } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface SnapConfig {
  /** 是否启用网格吸附 */
  gridEnabled: boolean;
  /** 网格大小 */
  gridSize: number;
  /** 是否启用节点吸附 */
  nodeEnabled: boolean;
  /** 是否启用中心点吸附 */
  centerEnabled: boolean;
  /** 吸附阈值（像素） */
  threshold: number;
}

export interface SnapResult {
  /** 吸附后的位置 */
  position: Point;
  /** 是否发生了吸附 */
  snapped: boolean;
  /** 水平方向吸附信息 */
  horizontal: SnapInfo | null;
  /** 垂直方向吸附信息 */
  vertical: SnapInfo | null;
}

export interface SnapInfo {
  /** 吸附类型 */
  type: 'grid' | 'node-edge' | 'node-center';
  /** 吸附到的值 */
  value: number;
  /** 关联的节点 ID（如果是节点吸附） */
  nodeId?: string;
}

export interface Guide {
  /** 参考线方向 */
  direction: 'horizontal' | 'vertical';
  /** 参考线位置 */
  position: number;
  /** 参考线起点 */
  start: number;
  /** 参考线终点 */
  end: number;
  /** 参考线类型 */
  type: 'edge' | 'center';
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SNAP_CONFIG: SnapConfig = {
  gridEnabled: true,
  gridSize: 20,
  nodeEnabled: true,
  centerEnabled: true,
  threshold: 8,
};

// =============================================================================
// Snap Engine Class
// =============================================================================

export class SnapEngine {
  private config: SnapConfig;
  private nodes: CanvasNode[] = [];
  private excludeIds: Set<string> = new Set();

  constructor(config: Partial<SnapConfig> = {}) {
    this.config = { ...DEFAULT_SNAP_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<SnapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置参考节点（用于节点吸附）
   */
  setNodes(nodes: CanvasNode[], excludeIds: string[] = []): void {
    this.nodes = nodes;
    this.excludeIds = new Set(excludeIds);
  }

  /**
   * 计算吸附位置
   */
  snap(position: Point, size: { width: number; height: number }): SnapResult {
    let resultX = position.x;
    let resultY = position.y;
    let horizontalSnap: SnapInfo | null = null;
    let verticalSnap: SnapInfo | null = null;

    const { threshold } = this.config;

    // 计算节点的边缘和中心
    const nodeLeft = position.x;
    const nodeRight = position.x + size.width;
    const nodeCenterX = position.x + size.width / 2;
    const nodeTop = position.y;
    const nodeBottom = position.y + size.height;
    const nodeCenterY = position.y + size.height / 2;

    // 1. 网格吸附
    if (this.config.gridEnabled) {
      const gridSnap = this.snapToGrid(position, size);
      if (gridSnap.horizontal) {
        resultX = gridSnap.position.x;
        horizontalSnap = gridSnap.horizontal;
      }
      if (gridSnap.vertical) {
        resultY = gridSnap.position.y;
        verticalSnap = gridSnap.vertical;
      }
    }

    // 2. 节点吸附（优先级高于网格）
    if (this.config.nodeEnabled || this.config.centerEnabled) {
      const referenceNodes = this.nodes.filter((n) => !this.excludeIds.has(n.id));

      for (const refNode of referenceNodes) {
        const refLeft = refNode.position.x;
        const refRight = refNode.position.x + refNode.size.width;
        const refCenterX = refNode.position.x + refNode.size.width / 2;
        const refTop = refNode.position.y;
        const refBottom = refNode.position.y + refNode.size.height;
        const refCenterY = refNode.position.y + refNode.size.height / 2;

        // 水平方向吸附
        if (this.config.nodeEnabled) {
          // 左边缘对齐
          if (Math.abs(nodeLeft - refLeft) < threshold) {
            resultX = refLeft;
            horizontalSnap = { type: 'node-edge', value: refLeft, nodeId: refNode.id };
          }
          // 右边缘对齐
          else if (Math.abs(nodeRight - refRight) < threshold) {
            resultX = refRight - size.width;
            horizontalSnap = { type: 'node-edge', value: refRight, nodeId: refNode.id };
          }
          // 左边缘对齐右边缘
          else if (Math.abs(nodeLeft - refRight) < threshold) {
            resultX = refRight;
            horizontalSnap = { type: 'node-edge', value: refRight, nodeId: refNode.id };
          }
          // 右边缘对齐左边缘
          else if (Math.abs(nodeRight - refLeft) < threshold) {
            resultX = refLeft - size.width;
            horizontalSnap = { type: 'node-edge', value: refLeft, nodeId: refNode.id };
          }
        }

        // 中心点水平对齐
        if (this.config.centerEnabled && Math.abs(nodeCenterX - refCenterX) < threshold) {
          resultX = refCenterX - size.width / 2;
          horizontalSnap = { type: 'node-center', value: refCenterX, nodeId: refNode.id };
        }

        // 垂直方向吸附
        if (this.config.nodeEnabled) {
          // 上边缘对齐
          if (Math.abs(nodeTop - refTop) < threshold) {
            resultY = refTop;
            verticalSnap = { type: 'node-edge', value: refTop, nodeId: refNode.id };
          }
          // 下边缘对齐
          else if (Math.abs(nodeBottom - refBottom) < threshold) {
            resultY = refBottom - size.height;
            verticalSnap = { type: 'node-edge', value: refBottom, nodeId: refNode.id };
          }
          // 上边缘对齐下边缘
          else if (Math.abs(nodeTop - refBottom) < threshold) {
            resultY = refBottom;
            verticalSnap = { type: 'node-edge', value: refBottom, nodeId: refNode.id };
          }
          // 下边缘对齐上边缘
          else if (Math.abs(nodeBottom - refTop) < threshold) {
            resultY = refTop - size.height;
            verticalSnap = { type: 'node-edge', value: refTop, nodeId: refNode.id };
          }
        }

        // 中心点垂直对齐
        if (this.config.centerEnabled && Math.abs(nodeCenterY - refCenterY) < threshold) {
          resultY = refCenterY - size.height / 2;
          verticalSnap = { type: 'node-center', value: refCenterY, nodeId: refNode.id };
        }
      }
    }

    return {
      position: { x: resultX, y: resultY },
      snapped: horizontalSnap !== null || verticalSnap !== null,
      horizontal: horizontalSnap,
      vertical: verticalSnap,
    };
  }

  /**
   * 网格吸附
   */
  private snapToGrid(position: Point, _size: { width: number; height: number }): SnapResult {
    const { gridSize, threshold } = this.config;

    let resultX = position.x;
    let resultY = position.y;
    let horizontalSnap: SnapInfo | null = null;
    let verticalSnap: SnapInfo | null = null;

    // 吸附到最近的网格线
    const nearestGridX = Math.round(position.x / gridSize) * gridSize;
    const nearestGridY = Math.round(position.y / gridSize) * gridSize;

    if (Math.abs(position.x - nearestGridX) < threshold) {
      resultX = nearestGridX;
      horizontalSnap = { type: 'grid', value: nearestGridX };
    }

    if (Math.abs(position.y - nearestGridY) < threshold) {
      resultY = nearestGridY;
      verticalSnap = { type: 'grid', value: nearestGridY };
    }

    return {
      position: { x: resultX, y: resultY },
      snapped: horizontalSnap !== null || verticalSnap !== null,
      horizontal: horizontalSnap,
      vertical: verticalSnap,
    };
  }

  /**
   * 生成对齐参考线
   */
  generateGuides(position: Point, size: { width: number; height: number }): Guide[] {
    const guides: Guide[] = [];
    const snapResult = this.snap(position, size);

    if (!snapResult.snapped) return guides;

    const nodeLeft = snapResult.position.x;
    const nodeRight = snapResult.position.x + size.width;
    const nodeTop = snapResult.position.y;
    const nodeBottom = snapResult.position.y + size.height;

    // 水平参考线
    if (snapResult.horizontal) {
      const { type, value, nodeId } = snapResult.horizontal;

      if (type === 'node-center' || type === 'node-edge') {
        const refNode = this.nodes.find((n) => n.id === nodeId);
        if (refNode) {
          guides.push({
            direction: 'vertical',
            position: value,
            start: Math.min(nodeTop, refNode.position.y),
            end: Math.max(nodeBottom, refNode.position.y + refNode.size.height),
            type: type === 'node-center' ? 'center' : 'edge',
          });
        }
      }
    }

    // 垂直参考线
    if (snapResult.vertical) {
      const { type, value, nodeId } = snapResult.vertical;

      if (type === 'node-center' || type === 'node-edge') {
        const refNode = this.nodes.find((n) => n.id === nodeId);
        if (refNode) {
          guides.push({
            direction: 'horizontal',
            position: value,
            start: Math.min(nodeLeft, refNode.position.x),
            end: Math.max(nodeRight, refNode.position.x + refNode.size.width),
            type: type === 'node-center' ? 'center' : 'edge',
          });
        }
      }
    }

    return guides;
  }
}

/**
 * Timeline Minimap Types
 * 时间线缩略图类型定义
 */

import type { ProjectData } from '../../../types';

// =============================================================================
// 缩略图数据
// =============================================================================

/** 缩略图数据 */
export interface ThumbnailData {
  /** 时间点（秒） */
  time: number;
  /** 缩略图图片 Data URL */
  dataUrl: string;
  /** 是否已加载 */
  loaded: boolean;
}

// =============================================================================
// Minimap 配置
// =============================================================================

/** Minimap 配置 */
export interface MinimapConfig {
  /** 最小高度 */
  minHeight: number;
  /** 最大高度 */
  maxHeight: number;
  /** 每个轨道的高度（用于动态计算） */
  trackHeight: number;
  /** 采样间隔（秒） */
  sampleInterval: number;
  /** 最大缓存数量 */
  maxCacheSize: number;
  /** 是否启用 */
  enabled: boolean;
}

/** 默认 Minimap 配置 */
export const DEFAULT_MINIMAP_CONFIG: MinimapConfig = {
  minHeight: 40, // 最小 40px（更紧凑）
  maxHeight: 120, // 最大 120px（避免占用过多空间）
  trackHeight: 12, // 每个轨道 12px（从 20px 缩小）
  sampleInterval: 2, // 每 2 秒一张缩略图
  maxCacheSize: 100,
  enabled: true,
};

/**
 * 计算 Minimap 动态高度
 * @param tracksCount 轨道数量
 * @param config Minimap 配置
 * @returns 计算后的高度（px）
 */
export function calculateMinimapHeight(tracksCount: number, config: MinimapConfig): number {
  const calculatedHeight = tracksCount * config.trackHeight;
  return Math.max(config.minHeight, Math.min(config.maxHeight, calculatedHeight));
}

// =============================================================================
// 组件 Props
// =============================================================================

/** Minimap 组件 Props */
export interface TimelineMinimapProps {
  /** 项目总时长 */
  totalDuration: number;
  /** 当前播放时间 */
  currentTime: number;
  /** 可视范围开始时间 */
  visibleStart: number;
  /** 可视范围结束时间 */
  visibleEnd: number;
  /** 缩放级别 */
  zoomLevel: number;
  /** 项目数据（用于生成缩略图） */
  project: ProjectData;
  /** 滚动到指定时间（调整可视窗口位置，不移动 playhead） */
  onScrollToTime: (time: number) => void;
  /** Minimap 配置 */
  config?: Partial<MinimapConfig>;
  /** 切换 Minimap 开关 */
  onToggle?: () => void;
}

/** MinimapThumbnails 组件 Props */
export interface MinimapThumbnailsProps {
  /** 缩略图数据列表 */
  thumbnails: ThumbnailData[];
  /** 总时长 */
  totalDuration: number;
  /** Minimap 宽度 */
  width: number;
  /** Minimap 高度 */
  height: number;
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 生成进度（0-1） */
  progress: number;
}

/** MinimapViewport 组件 Props */
export interface MinimapViewportProps {
  /** 可视范围开始时间 */
  visibleStart: number;
  /** 可视范围结束时间 */
  visibleEnd: number;
  /** 当前播放时间 */
  currentTime: number;
  /** 总时长 */
  totalDuration: number;
  /** Minimap 宽度 */
  width: number;
}

/** MinimapToggle 组件 Props */
export interface MinimapToggleProps {
  /** 是否启用 */
  enabled: boolean;
  /** 切换回调 */
  onToggle: () => void;
}

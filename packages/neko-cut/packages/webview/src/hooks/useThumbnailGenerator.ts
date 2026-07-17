/**
 * useThumbnailGenerator Hook
 * 缩略图生成 Hook
 *
 * 策略:
 * 1. 渲染时间线轨道布局的概览图（不是视频内容）
 * 2. 使用 Canvas 2D 绘制轨道和元素
 * 3. 生成单个时间线布局快照
 * 4. 使用 VSCode 主题色系统保持一致性
 */

import { useState, useEffect, useCallback } from 'react';
import type { ProjectData } from '../types';
import type { ThumbnailData } from '../components/Timeline/TimelineMinimap/types';

// =============================================================================
// 类型定义
// =============================================================================

export interface UseThumbnailGeneratorOptions {
  /** 项目数据 */
  project: ProjectData;
  /** 项目总时长 */
  totalDuration: number;
  /** 采样间隔（秒） - 未使用，保留以兼容接口 */
  sampleInterval: number;
  /** 最大缓存数量 - 未使用，保留以兼容接口 */
  maxCacheSize: number;
  /** 是否启用 */
  enabled: boolean;
}

export interface UseThumbnailGeneratorResult {
  /** 缩略图数据列表 */
  thumbnails: ThumbnailData[];
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 生成进度（0-1） */
  progress: number;
  /** 错误信息 */
  error: string | null;
}

// =============================================================================
// 颜色配置（使用 VSCode 主题色）
// =============================================================================

/**
 * 从 CSS 变量获取颜色
 */
function getCSSColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

/**
 * 获取 VSCode 主题色
 */
function getThemeColors() {
  return {
    // 背景色
    editorBg: getCSSColor('--vscode-editor-background', '#1e1e1e'),
    sidebarBg: getCSSColor('--vscode-sideBar-background', '#252526'),

    // 前景色
    editorFg: getCSSColor('--vscode-editor-foreground', '#d4d4d4'),

    // 强调色
    accentBlue: getCSSColor('--vscode-focusBorder', '#007acc'),

    // 语法高亮色（VSCode 默认主题）
    blue: '#569cd6', // 关键字蓝
    lightBlue: '#9cdcfe', // 变量浅蓝
    green: '#6a9955', // 字符串绿
    teal: '#4ec9b0', // 类型青
    yellow: '#dcdcaa', // 函数黄
    orange: '#ce9178', // 数字橙
    purple: '#c586c0', // 控制流紫

    // 边框色
    border: getCSSColor('--vscode-panel-border', '#3c3c3c'),
  };
}

/**
 * 轨道类型颜色配置
 */
const TRACK_TYPE_COLORS = {
  media: {
    background: 'rgba(86, 156, 214, 0.15)', // 蓝色半透明
    element: '#569cd6', // VSCode 关键字蓝
  },
  audio: {
    background: 'rgba(78, 201, 176, 0.15)', // 青色半透明
    element: '#4ec9b0', // VSCode 类型青
  },
  text: {
    background: 'rgba(220, 220, 170, 0.15)', // 黄色半透明
    element: '#dcdcaa', // VSCode 函数黄
  },
  effect: {
    background: 'rgba(197, 134, 192, 0.15)', // 紫色半透明
    element: '#c586c0', // VSCode 控制流紫
  },
};

// =============================================================================
// Hook Implementation
// =============================================================================

export function useThumbnailGenerator({
  project,
  totalDuration,
  sampleInterval: _sampleInterval, // 保留接口兼容性
  maxCacheSize: _maxCacheSize, // 保留接口兼容性
  enabled,
}: UseThumbnailGeneratorOptions): UseThumbnailGeneratorResult {
  const [thumbnails, setThumbnails] = useState<ThumbnailData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 生成时间线轨道布局缩略图
  const generateTimelineSnapshot = useCallback((): ThumbnailData => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return {
        time: 0,
        dataUrl: '',
        loaded: false,
      };
    }

    // Minimap 尺寸配置（与组件配置保持一致）
    const width = 1200; // 固定宽度以提升清晰度
    const trackHeight = 12; // 每个轨道高度（与 types.ts 中的 trackHeight 一致）
    const trackGap = 0.5; // 轨道间隙（缩小）
    const elementPadding = 1; // 元素上下内边距（缩小）

    // Canvas 高度：渲染所有轨道（不受容器高度限制）
    // 容器会通过滚动条来显示超出部分
    const calculatedHeight = project.tracks.length * (trackHeight + trackGap);
    const height = Math.max(40, calculatedHeight); // 最小 40px，无最大限制

    canvas.width = width;
    canvas.height = height;

    // 获取主题色
    const colors = getThemeColors();

    // 绘制背景
    ctx.fillStyle = colors.editorBg;
    ctx.fillRect(0, 0, width, height);

    // 计算时间到像素的转换比例
    const pixelsPerSecond = totalDuration > 0 ? width / totalDuration : 0;

    // 绘制每个轨道
    project.tracks.forEach((track, trackIndex) => {
      const y = trackIndex * (trackHeight + trackGap);
      const trackType = track.type as keyof typeof TRACK_TYPE_COLORS;
      const trackColors = TRACK_TYPE_COLORS[trackType] || TRACK_TYPE_COLORS.media;

      // 轨道背景
      ctx.fillStyle = trackColors.background;
      ctx.fillRect(0, y, width, trackHeight);

      // 轨道分隔线（除了第一条）
      if (trackIndex > 0) {
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 绘制元素
      track.elements.forEach((element) => {
        const x = element.startTime * pixelsPerSecond;
        const elementWidth = Math.max(2, element.duration * pixelsPerSecond);

        // 元素主体
        ctx.fillStyle = trackColors.element;
        ctx.fillRect(x, y + elementPadding, elementWidth, trackHeight - elementPadding * 2);

        // 元素高亮边框（宽度足够时）
        if (elementWidth > 4) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(
            x + 0.5,
            y + elementPadding + 0.5,
            elementWidth - 1,
            trackHeight - elementPadding * 2 - 1,
          );
        }
      });
    });

    // 生成 JPEG dataUrl（比 PNG 小 60-80%）
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // 显式释放 Canvas 资源
    canvas.width = 0;
    canvas.height = 0;

    return {
      time: 0,
      dataUrl,
      loaded: true,
    };
  }, [project, totalDuration]);

  // 生成缩略图
  useEffect(() => {
    if (!enabled || !project || totalDuration === 0) {
      setThumbnails([]);
      setIsGenerating(false);
      setProgress(0);
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setError(null);

    try {
      const snapshot = generateTimelineSnapshot();
      setThumbnails([snapshot]);
      setProgress(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate timeline snapshot');
    } finally {
      setIsGenerating(false);
    }
  }, [enabled, project, totalDuration, generateTimelineSnapshot]);

  return {
    thumbnails,
    isGenerating,
    progress,
    error,
  };
}

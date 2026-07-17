/**
 * TimelineMinimap Component
 * 时间线缩略图预览组件
 *
 * 功能:
 * - 显示整个项目时间范围的缩略图
 * - 高亮显示当前可视时间线范围
 * - 点击跳转到指定时间位置
 * - 支持开关隐藏/显示
 */

import { memo, useRef, useMemo, useState, useEffect } from 'react';
import { MinimapThumbnails } from './MinimapThumbnails';
import { MinimapViewport } from './MinimapViewport';
import { MinimapToggle } from './MinimapToggle';
import { useThumbnailGenerator } from '../../../hooks/useThumbnailGenerator';
import { useMinimapInteraction } from '../../../hooks/useMinimapInteraction';
import { TRACK_LABEL_WIDTH } from '../../../constants';
import type { TimelineMinimapProps } from './types';
import { DEFAULT_MINIMAP_CONFIG, calculateMinimapHeight } from './types';

export const TimelineMinimap = memo(function TimelineMinimap({
  totalDuration,
  currentTime,
  visibleStart,
  visibleEnd,
  zoomLevel: _zoomLevel, // 标记为未使用但必须接收
  project,
  onScrollToTime,
  config: configOverride,
  onToggle,
}: TimelineMinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 合并配置
  const config = { ...DEFAULT_MINIMAP_CONFIG, ...configOverride };

  // 动态计算高度
  const minimapHeight = useMemo(() => {
    return calculateMinimapHeight(project.tracks.length, config);
  }, [project.tracks.length, config]);

  // 生成缩略图
  const { thumbnails, isGenerating, progress, error } = useThumbnailGenerator({
    project,
    totalDuration,
    sampleInterval: config.sampleInterval,
    maxCacheSize: config.maxCacheSize,
    enabled: config.enabled,
  });

  // 交互逻辑
  const { isDragging, handleMouseDown, handleClick } = useMinimapInteraction({
    totalDuration,
    visibleStart,
    visibleEnd,
    onScrollToTime,
    containerRef,
  });

  // 使用 ResizeObserver 监听容器宽度变化，避免同步 DOM 查询
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    // 初始化宽度
    setContainerWidth(container.offsetWidth);

    return () => resizeObserver.disconnect();
  }, []);

  // 如果未启用，不渲染
  if (!config.enabled) {
    return null;
  }

  return (
    <div className="flex border-b border-vscode-panel-border" style={{ height: minimapHeight }}>
      {/* Track labels header - spacer to align with track labels */}
      <div
        className="shrink-0 border-r border-vscode-panel-border bg-vscode-sidebar-bg flex items-center justify-center"
        style={{ width: TRACK_LABEL_WIDTH }}
      >
        {onToggle && <MinimapToggle enabled={config.enabled} onToggle={onToggle} />}
      </div>

      {/* Minimap content */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-pointer select-none overflow-hidden bg-vscode-editor-bg"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        style={{
          cursor: isDragging ? 'grabbing' : 'pointer',
        }}
      >
        {/* 缩略图条 */}
        <MinimapThumbnails
          thumbnails={thumbnails}
          totalDuration={totalDuration}
          width={containerWidth}
          height={minimapHeight}
          isGenerating={isGenerating}
          progress={progress}
        />

        {/* 可视范围指示器 */}
        <MinimapViewport
          visibleStart={visibleStart}
          visibleEnd={visibleEnd}
          currentTime={currentTime}
          totalDuration={totalDuration}
          width={containerWidth}
        />

        {/* 错误提示 */}
        {error && (
          <div className="absolute top-1 right-1 px-2 py-1 bg-vscode-inputValidation-errorBackground text-vscode-inputValidation-errorForeground text-xs rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
});

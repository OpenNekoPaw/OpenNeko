/**
 * MinimapViewport Component
 * Minimap 可视范围指示器
 */

import { memo, useMemo } from 'react';
import type { MinimapViewportProps } from './types';

export const MinimapViewport = memo(function MinimapViewport({
  visibleStart,
  visibleEnd,
  currentTime,
  totalDuration,
  width: _width, // 标记为未使用但必须接收
}: MinimapViewportProps) {
  // 计算可视范围的位置和宽度
  const viewportStyle = useMemo(() => {
    if (totalDuration === 0) return { left: 0, width: 0 };

    const startPercent = (visibleStart / totalDuration) * 100;
    const endPercent = (visibleEnd / totalDuration) * 100;
    const widthPercent = endPercent - startPercent;

    return {
      left: `${startPercent}%`,
      width: `${widthPercent}%`,
    };
  }, [visibleStart, visibleEnd, totalDuration]);

  // 计算当前时间指示器的位置
  const playheadStyle = useMemo(() => {
    if (totalDuration === 0) return { left: 0 };

    const percent = (currentTime / totalDuration) * 100;
    return {
      left: `${percent}%`,
    };
  }, [currentTime, totalDuration]);

  return (
    <>
      {/* 可视范围矩形 */}
      <div
        className="absolute top-0 h-full border-2 border-vscode-focusBorder bg-vscode-focusBorder/10 pointer-events-none"
        style={viewportStyle}
      />

      {/* 当前时间指示器（红色竖线） */}
      <div
        className="absolute top-0 w-0.5 h-full bg-red-500 pointer-events-none z-10"
        style={playheadStyle}
      />
    </>
  );
});

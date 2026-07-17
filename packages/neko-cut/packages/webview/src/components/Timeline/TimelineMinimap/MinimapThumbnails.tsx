/**
 * MinimapThumbnails Component
 * Minimap 缩略图条
 */

import { memo } from 'react';
import type { MinimapThumbnailsProps } from './types';

export const MinimapThumbnails = memo(function MinimapThumbnails({
  thumbnails,
  totalDuration,
  width: _width, // 标记为未使用但必须接收
  height,
  isGenerating,
  progress,
}: MinimapThumbnailsProps) {
  if (thumbnails.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-vscode-editor-bg">
        <div className="flex flex-col items-center gap-2">
          {isGenerating ? (
            <>
              <div className="w-6 h-6 border-2 border-vscode-progressBar-background border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-vscode-descriptionForeground">
                Generating thumbnails... {Math.round(progress * 100)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-vscode-descriptionForeground">
              No thumbnails available
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-vscode-editor-bg overflow-y-auto overflow-x-hidden">
      <div className="relative w-full" style={{ height }}>
        {thumbnails.map((thumbnail, index) => {
          // 计算每个缩略图的位置（按时间比例）
          const leftPercent = totalDuration > 0 ? (thumbnail.time / totalDuration) * 100 : 0;

          // 计算缩略图宽度（填满两个采样点之间的空间）
          const nextTime =
            index < thumbnails.length - 1 ? thumbnails[index + 1].time : totalDuration;
          const widthPercent =
            totalDuration > 0 ? ((nextTime - thumbnail.time) / totalDuration) * 100 : 0;

          return (
            <div
              key={`${thumbnail.time}-${index}`}
              className="absolute top-0"
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
            >
              {thumbnail.loaded ? (
                <img
                  src={thumbnail.dataUrl}
                  alt={`Thumbnail at ${thumbnail.time}s`}
                  className="w-full h-full"
                  draggable={false}
                  style={{
                    display: 'block',
                    imageRendering: 'crisp-edges',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div className="w-full h-full bg-vscode-input-background flex items-center justify-center">
                  <div className="w-4 h-4 border border-vscode-progressBar-background border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          );
        })}

        {/* 生成进度条覆盖层 */}
        {isGenerating && progress < 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-vscode-progressBar-background/30 z-10">
            <div
              className="h-full bg-vscode-progressBar-background transition-all duration-200"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

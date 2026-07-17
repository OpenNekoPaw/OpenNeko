/**
 * ExportProgressView - Export progress UI with performance stats.
 * Extracted from ExportPanel.tsx.
 */

import type { ExportProgress } from './exportConstants';
import { getStageLabel, formatTimeRemaining, formatElapsedTime } from './exportUtils';

interface ExportProgressViewProps {
  exportProgress: ExportProgress | null;
  queueStatus: { active: number; pending: number };
  onBackgroundExport: () => void;
  onCancel: () => void;
}

export function ExportProgressView({
  exportProgress,
  queueStatus,
  onBackgroundExport,
  onCancel,
}: ExportProgressViewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--vscode-sideBar-background)] rounded-lg shadow-xl w-[400px] max-w-full border border-vscode-panel-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-panel-border">
          <h2 className="text-lg font-semibold text-vscode-editor-foreground">正在导出</h2>
          <button
            onClick={onBackgroundExport}
            className="p-1 rounded hover:bg-vscode-list-hoverBackground text-vscode-foreground"
            title="后台导出"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        {/* Progress Content */}
        <div className="p-4 space-y-4">
          {/* Stage Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 border-[3px] border-t-transparent rounded-full animate-spin"
              style={{
                borderColor: 'var(--vscode-progressBar-background)',
                borderTopColor: 'transparent',
              }}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-vscode-foreground">
                {exportProgress?.message || getStageLabel(exportProgress?.stage)}
              </div>
              <div className="text-xs text-vscode-descriptionForeground">
                {exportProgress && exportProgress.totalFrames > 0 && (
                  <span>
                    {exportProgress.currentFrame}/{exportProgress.totalFrames} 帧
                  </span>
                )}
              </div>
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: 'var(--vscode-progressBar-background)' }}
            >
              {Math.round(exportProgress?.percent || 0)}%
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-3 bg-vscode-input-background rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                width: `${exportProgress?.percent || 0}%`,
                backgroundColor: 'var(--vscode-progressBar-background)',
              }}
            />
          </div>

          {/* Queue Status */}
          {queueStatus.pending > 0 && (
            <div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground">
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 10h16M4 14h8"
                />
              </svg>
              <span>
                已排队 <strong>{queueStatus.pending}</strong> 个导出任务
              </span>
            </div>
          )}

          {/* Stats Row */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-md text-xs"
            style={{ backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)' }}
          >
            <div className="flex items-center gap-4">
              {exportProgress && exportProgress.currentFps > 0 && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-mono font-semibold"
                    style={{ color: 'var(--vscode-charts-yellow)' }}
                  >
                    {exportProgress.currentFps.toFixed(1)}
                  </span>
                  <span style={{ color: 'var(--vscode-foreground)', opacity: 0.7 }}>fps</span>
                </div>
              )}
              {exportProgress && exportProgress.elapsedTime > 0 && (
                <span style={{ color: 'var(--vscode-foreground)' }}>
                  {formatElapsedTime(exportProgress.elapsedTime)}
                </span>
              )}
            </div>
            {exportProgress && exportProgress.estimatedTimeRemaining > 0 && (
              <span className="font-semibold" style={{ color: 'var(--vscode-charts-green)' }}>
                {formatTimeRemaining(exportProgress.estimatedTimeRemaining)}
              </span>
            )}
          </div>

          {/* Performance Stats */}
          {exportProgress?.performanceStats && (
            <div
              className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2.5 rounded-md text-xs"
              style={{ backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)' }}
            >
              {exportProgress.performanceStats.avgDecodeTime != null &&
                exportProgress.performanceStats.avgDecodeTime >= 0.05 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>解码</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.avgDecodeTime.toFixed(1)} ms
                    </span>
                  </div>
                )}
              {exportProgress.performanceStats.avgRenderTime != null &&
                exportProgress.performanceStats.avgRenderTime >= 0.05 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>合成</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.avgRenderTime.toFixed(1)} ms
                    </span>
                  </div>
                )}
              {exportProgress.performanceStats.avgEncodeTime != null &&
                exportProgress.performanceStats.avgEncodeTime >= 0.05 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>编码</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.avgEncodeTime.toFixed(1)} ms
                    </span>
                  </div>
                )}
              {exportProgress.performanceStats.cpuUsage != null &&
                exportProgress.performanceStats.cpuUsage > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>CPU</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.cpuUsage.toFixed(0)}%
                    </span>
                  </div>
                )}
              {exportProgress.performanceStats.memoryUsedMB != null &&
                exportProgress.performanceStats.memoryUsedMB > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>内存</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.memoryUsedMB.toFixed(0)} MB
                    </span>
                  </div>
                )}
              {exportProgress.performanceStats.vramUsedMB != null &&
                exportProgress.performanceStats.vramUsedMB > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>显存</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.vramUsedMB.toFixed(0)} MB
                    </span>
                  </div>
                )}
              {exportProgress.performanceStats.gpuUsage != null &&
                exportProgress.performanceStats.gpuUsage > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--vscode-foreground)', opacity: 0.6 }}>GPU</span>
                    <span className="font-mono" style={{ color: 'var(--vscode-foreground)' }}>
                      {exportProgress.performanceStats.gpuUsage.toFixed(0)}%
                    </span>
                  </div>
                )}
            </div>
          )}

          <div className="text-xs text-center text-vscode-descriptionForeground opacity-60">
            提示：点击右上角可最小化到状态栏继续后台导出
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-4 py-3 border-t border-vscode-panel-border">
          <button
            onClick={onBackgroundExport}
            className="px-4 py-2 bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground rounded text-vscode-button-secondaryForeground transition-colors text-sm"
          >
            后台运行
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm transition-colors"
            style={{
              backgroundColor: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
              color: 'var(--vscode-inputValidation-errorForeground, #ffffff)',
              border: '1px solid var(--vscode-inputValidation-errorBorder, #be1100)',
            }}
          >
            取消导出
          </button>
        </div>
      </div>
    </div>
  );
}

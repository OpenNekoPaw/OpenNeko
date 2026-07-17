/**
 * PerformanceOverlay - FPS counter and performance stats display.
 * Extracted from PreviewPanel.tsx.
 */

import { memo } from 'react';

interface PerformanceOverlayProps {
  performanceStats: {
    currentTime: number;
    frameIndex: number;
    targetFps: number;
    resolution: string;
    gpuBackend: string;
    bitrateKbps: number;
    decodeTime: number;
    renderTime: number;
    compositeTime: number;
    frameTimeP50: number;
    frameTimeP95: number;
    droppedFrames: number;
    cachedFrames: number;
    memoryUsedMB: number;
    engineAvgFps: number;
    engineHwDecodeMs: number;
    engineCompositeMs: number;
    engineEncodeTimeMs: number;
    engineCpuUsagePercent: number;
    enginePeakMemoryBytes: number;
  };
  currentFps: number;
  targetFps: number;
  clockSource: 'wall' | 'audio';
}

export const PerformanceOverlay = memo(function PerformanceOverlay({
  performanceStats,
  currentFps,
  targetFps,
  clockSource,
}: PerformanceOverlayProps) {
  return (
    <div
      className="absolute top-2 right-2 px-2 py-1.5 rounded text-xs font-mono opacity-80 hover:opacity-100 transition-opacity"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
      title="Performance Stats"
    >
      <div className="flex flex-col gap-1">
        {/* Header: time / frame / target fps */}
        <div className="text-[10px] leading-tight text-center text-gray-400 border-b border-gray-600 pb-1">
          <span>{performanceStats.currentTime.toFixed(2)}s</span>
          <span className="mx-1">|</span>
          <span>F{performanceStats.frameIndex}</span>
          <span className="mx-1">|</span>
          <span>{performanceStats.targetFps}fps</span>
        </div>

        {/* Stream info */}
        <div className="text-[10px] leading-tight space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Resolution</span>
            <span className="text-gray-300">{performanceStats.resolution}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Mode</span>
            <span style={{ color: '#49a' }}>H.264 Stream</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Decoder</span>
            <span className="text-cyan-400">{performanceStats.gpuBackend}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Clock</span>
            <span className="text-cyan-400">{clockSource}</span>
          </div>
        </div>

        <div className="border-t border-gray-600 my-0.5" />

        {/* FPS & Bitrate */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-400">FPS</span>
          <span
            style={{
              color:
                currentFps >= targetFps * 0.9
                  ? '#4a9'
                  : currentFps >= targetFps * 0.5
                    ? '#fa0'
                    : '#f44',
              fontWeight: 'bold',
            }}
          >
            {currentFps.toFixed(1)}
          </span>
        </div>
        <div className="text-[10px] leading-tight">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Bitrate</span>
            <span className="text-gray-300">
              {performanceStats.bitrateKbps >= 1000
                ? `${(performanceStats.bitrateKbps / 1000).toFixed(1)} Mbps`
                : `${performanceStats.bitrateKbps.toFixed(0)} kbps`}
            </span>
          </div>
        </div>

        <div className="border-t border-gray-600 my-0.5" />

        {/* Timing stats */}
        <div className="text-[10px] leading-tight space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Decode</span>
            <span className="text-gray-300">{performanceStats.decodeTime.toFixed(1)}ms</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Render</span>
            <span className="text-gray-300">{performanceStats.renderTime.toFixed(1)}ms</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Latency</span>
            <span className="text-gray-300">{performanceStats.compositeTime.toFixed(1)}ms</span>
          </div>
        </div>

        <div className="border-t border-gray-600 my-0.5" />

        {/* Frame time percentiles & system */}
        <div className="text-[10px] leading-tight space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">P50</span>
            <span className="text-gray-300">{performanceStats.frameTimeP50.toFixed(1)}ms</span>
            <span className="text-gray-600 mx-0.5">|</span>
            <span className="text-gray-500">P95</span>
            <span className="text-gray-300">{performanceStats.frameTimeP95.toFixed(1)}ms</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Dropped</span>
            <span style={{ color: performanceStats.droppedFrames === 0 ? '#4a9' : '#f44' }}>
              {performanceStats.droppedFrames}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Queue</span>
            <span className="text-gray-300">{performanceStats.cachedFrames}</span>
          </div>
          {performanceStats.memoryUsedMB > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Memory</span>
              <span className="text-gray-300">{performanceStats.memoryUsedMB.toFixed(0)} MB</span>
            </div>
          )}
        </div>

        {/* Engine Pipeline Stats */}
        {performanceStats.engineAvgFps > 0 && (
          <>
            <div className="border-t border-gray-600 my-0.5" />
            <div className="text-[10px] leading-tight">
              <div className="text-center text-gray-500 mb-0.5">Engine Pipeline</div>
              <div className="space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">HW Decode</span>
                  <span className="text-gray-300">
                    {performanceStats.engineHwDecodeMs.toFixed(1)}ms
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Composite</span>
                  <span className="text-gray-300">
                    {performanceStats.engineCompositeMs.toFixed(1)}ms
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Encode</span>
                  <span className="text-gray-300">
                    {performanceStats.engineEncodeTimeMs.toFixed(1)}ms
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Engine FPS</span>
                  <span className="text-gray-300">{performanceStats.engineAvgFps.toFixed(1)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">CPU</span>
                  <span className="text-gray-300">
                    {performanceStats.engineCpuUsagePercent.toFixed(1)}%
                  </span>
                </div>
                {performanceStats.enginePeakMemoryBytes > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Peak Mem</span>
                    <span className="text-gray-300">
                      {(performanceStats.enginePeakMemoryBytes / 1024 / 1024).toFixed(0)} MB
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

/**
 * Export Tool Handlers
 * Handles video export operations via Extension FFmpeg (export:* protocol)
 */

import type { ToolHandler, ToolHandlerResult } from '../types';
import { useEditorStore } from '../../stores/editor-store';
import type {
  ExportRequest,
  ExportResponse,
  ExportSettings,
  ExportFormat,
  ExportQuality,
  ProjectData,
} from '@neko/shared';
import { getVSCodeAPI } from '../../utils/vscodeApi';

// Export progress tracking
interface ExportProgress {
  id: string;
  status: 'preparing' | 'encoding' | 'muxing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentFrame: number;
  totalFrames: number;
  estimatedTimeRemaining?: number;
  error?: string;
  outputPath?: string;
}

// Active exports registry
const activeExports: Map<string, ExportProgress> = new Map();

/**
 * Calculate project duration from tracks
 */
function calculateProjectDuration(project: ProjectData): number {
  let maxEndTime = 0;
  for (const track of project.tracks) {
    for (const element of track.elements) {
      const endTime =
        element.startTime + element.duration - (element.trimStart || 0) - (element.trimEnd || 0);
      if (endTime > maxEndTime) {
        maxEndTime = endTime;
      }
    }
  }
  return maxEndTime;
}

/**
 * Start video export
 */
const exportVideo: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { format, resolution, width, height, fps, quality, audioBitrate, videoBitrate } =
    params as {
      format?: ExportFormat;
      resolution?: string;
      width?: number;
      height?: number;
      fps?: number;
      quality?: ExportQuality | 'ultra';
      audioBitrate?: number;
      videoBitrate?: number;
    };

  const store = useEditorStore.getState();
  const { project } = store;

  if (!project) {
    return { success: false, error: 'No project loaded' };
  }

  const vscode = getVSCodeAPI();
  if (!vscode) {
    return { success: false, error: 'VSCode API not available' };
  }

  // Parse resolution string (e.g., "1920x1080") when width/height not explicitly provided
  let parsedWidth = width;
  let parsedHeight = height;
  if ((!parsedWidth || !parsedHeight) && resolution) {
    const match = resolution.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (match) {
      parsedWidth = Number(match[1]);
      parsedHeight = Number(match[2]);
    }
  }

  // Build export settings with defaults
  const settings: ExportSettings = {
    width: parsedWidth ?? project.resolution.width,
    height: parsedHeight ?? project.resolution.height,
    fps: fps ?? project.fps,
    format: (format ?? 'mp4') as ExportFormat,
    quality: (quality === 'ultra' ? 'high' : (quality ?? 'high')) as ExportQuality,
    audioBitrate: audioBitrate ?? 192,
    videoBitrate,
  };

  if (settings.format !== 'mp4' && settings.format !== 'webm') {
    return { success: false, error: `Unsupported format for Extension export: ${settings.format}` };
  }

  // Validate settings
  if (settings.width <= 0 || settings.height <= 0) {
    return { success: false, error: 'Invalid dimensions' };
  }
  if (settings.fps <= 0 || settings.fps > 120) {
    return { success: false, error: 'FPS must be between 1 and 120' };
  }

  // Generate requestId (jobId will come from Extension)
  const requestId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Calculate project duration and frame count
  const duration = calculateProjectDuration(project);
  const totalFrames = Math.ceil(duration * settings.fps);

  if (totalFrames === 0) {
    return { success: false, error: 'Project has no content to export' };
  }

  // Send export:start to Extension; Extension will ask user for save path
  const suggestedName = `export_${Date.now()}.${settings.format}`;
  const request: ExportRequest = {
    type: 'export:start',
    requestId,
    timestamp: Date.now(),
    payload: {
      project,
      outputPath: suggestedName,
      settings,
    },
  };

  const jobId = await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Export start timeout'));
    }, 30_000);

    const handler = (event: MessageEvent) => {
      const message = event.data as ExportResponse;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'export:started' && message.requestId === requestId) {
        window.clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve((message as { jobId: string }).jobId);
      }

      if (message.type === 'export:error' && message.requestId === requestId) {
        window.clearTimeout(timeout);
        window.removeEventListener('message', handler);
        reject(new Error((message as { error?: string }).error ?? 'Export failed to start'));
      }
    };

    window.addEventListener('message', handler);
    vscode.postMessage(request);
  });

  // Initialize progress tracking (keyed by jobId)
  const progress: ExportProgress = {
    id: jobId,
    status: 'preparing',
    progress: 0,
    currentFrame: 0,
    totalFrames,
  };
  activeExports.set(jobId, progress);

  return {
    success: true,
    data: {
      exportId: jobId,
      message: 'Export started',
      totalFrames,
      duration,
      settings,
    },
  };
};

/**
 * Get export progress
 */
const getExportProgress: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { exportId } = params as { exportId?: string };

  // If no exportId, return all active exports
  if (!exportId) {
    const exports = Array.from(activeExports.values());
    return {
      success: true,
      data: {
        exports,
        activeCount: exports.filter((e) => e.status !== 'completed' && e.status !== 'failed')
          .length,
      },
    };
  }

  // Get specific export progress
  const progress = activeExports.get(exportId);
  if (!progress) {
    return { success: false, error: `Export not found: ${exportId}` };
  }

  return {
    success: true,
    data: progress,
  };
};

/**
 * Cancel an active export
 */
const cancelExport: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { exportId } = params as { exportId: string };

  if (!exportId) {
    return { success: false, error: 'exportId is required' };
  }

  const progress = activeExports.get(exportId);
  if (!progress) {
    return { success: false, error: `Export not found: ${exportId}` };
  }

  if (progress.status === 'completed' || progress.status === 'failed') {
    return { success: false, error: 'Export already finished' };
  }

  // Send export:cancel request to extension
  const vscode = getVSCodeAPI();
  if (vscode) {
    const request: ExportRequest = {
      type: 'export:cancel',
      requestId: `cancel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      payload: { jobId: exportId },
    };
    vscode.postMessage(request);
  }

  // Update local status
  progress.status = 'failed';
  progress.error = 'Cancelled by user';

  return {
    success: true,
    data: { message: 'Export cancelled' },
  };
};

/**
 * Update export progress (called from extension via message)
 */
export function updateExportProgress(exportId: string, update: Partial<ExportProgress>): void {
  const progress = activeExports.get(exportId);
  if (progress) {
    Object.assign(progress, update);

    // Clean up completed/failed exports after a delay
    if (progress.status === 'completed' || progress.status === 'failed') {
      setTimeout(() => {
        activeExports.delete(exportId);
      }, 60000); // Keep for 1 minute after completion
    }
  }
}

/**
 * Get export settings from project
 */
const getExportSettings: ToolHandler = async (): Promise<ToolHandlerResult> => {
  const store = useEditorStore.getState();
  const { project } = store;

  if (!project) {
    return { success: false, error: 'No project loaded' };
  }

  const duration = calculateProjectDuration(project);
  const defaultSettings: ExportSettings = {
    width: project.resolution.width,
    height: project.resolution.height,
    fps: project.fps,
    format: 'mp4',
    quality: 'high',
    audioBitrate: 192,
  };

  return {
    success: true,
    data: {
      projectDuration: duration,
      defaultSettings,
      supportedFormats: ['mp4', 'webm', 'gif', 'png-sequence', 'jpeg-sequence', 'webp-sequence'],
      qualityOptions: ['low', 'medium', 'high'],
    },
  };
};

export const exportHandlers: Record<string, ToolHandler> = {
  ExportVideo: exportVideo,
  GetExportProgress: getExportProgress,
  CancelExport: cancelExport,
  GetExportSettings: getExportSettings,
};

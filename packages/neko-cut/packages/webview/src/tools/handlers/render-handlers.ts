/**
 * Render Tool Handlers
 * Handles rendering operations: render_frame, render_clip, get_thumbnail
 *
 * 使用 Extension FFmpeg（通过 MediaRequestProxy / export:* 协议）完成媒体侧工作
 */

import type { ToolHandler, ToolHandlerResult } from '../types';
import { useEditorStore } from '../../stores/editor-store';
import type {
  ExportRequest,
  ExportResponse,
  ExportSettings,
  MediaElement,
  ProjectData,
} from '@neko/shared';
import { generateId } from '../../utils';
import { getMediaProxy } from '../../services/mediaProxyFactory';
import { getThumbnailService } from '../../services';
import { hasMediaSource, isTimeInElement } from '../../types/capabilities';
import {
  getClipSourceTimeAtDisplayTime,
  getClipTimelineDuration,
} from '../../utils/clipThumbnails';
import { getVSCodeAPI } from '../../utils/vscodeApi';

/**
 * Active render clip tasks
 */
const activeRenderTasks: Map<
  string,
  {
    status: 'pending' | 'rendering' | 'completed' | 'failed';
    progress: number;
    totalFrames: number;
    currentFrame: number;
    error?: string;
    result?: string; // base64 data or file path
  }
> = new Map();

export function updateRenderTask(
  taskId: string,
  update: Partial<{
    status: 'pending' | 'rendering' | 'completed' | 'failed';
    progress: number;
    totalFrames: number;
    currentFrame: number;
    error?: string;
    result?: string;
  }>,
): void {
  const task = activeRenderTasks.get(taskId);
  if (!task) return;
  Object.assign(task, update);
}

function mimeFromFormat(format: 'png' | 'jpeg' | 'webp'): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
  }
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function findTopmostMediaElementAtTime(
  project: ProjectData,
  time: number,
): { element: MediaElement; sourceTime: number } | null {
  // Track 顺序通常从下到上：后面的轨道更”上层”，因此倒序找第一个命中的媒体元素
  for (let trackIndex = project.tracks.length - 1; trackIndex >= 0; trackIndex--) {
    const track = project.tracks[trackIndex];
    for (const el of track.elements) {
      if (!hasMediaSource(el)) continue;
      if (el.type !== 'media') continue;
      if (!isTimeInElement(el, time)) continue;

      const sourceTime = getClipSourceTimeAtDisplayTime(el, time - el.startTime);
      return { element: el as MediaElement, sourceTime };
    }
  }
  return null;
}

/**
 * Render a single frame at a specific time point
 * 说明：此处返回“时间点对应的顶层媒体元素帧”，避免引入完整合成渲染管线
 */
const renderFrame: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { time, width, height, format, quality } = params as {
    time: number;
    width?: number;
    height?: number;
    format?: 'png' | 'jpeg' | 'webp';
    quality?: number;
  };

  if (time === undefined || time < 0) {
    return { success: false, error: 'time must be a non-negative number' };
  }

  const store = useEditorStore.getState();
  const { project } = store;

  if (!project) {
    return { success: false, error: 'No project loaded' };
  }

  // Use project resolution if not specified
  const outputWidth = width ?? project.resolution.width;
  const outputHeight = height ?? project.resolution.height;
  const outputFormat = format ?? 'png';
  const outputQuality = quality ?? 90;

  try {
    const found = findTopmostMediaElementAtTime(project, time);
    if (!found) {
      return { success: false, error: 'No media element found at specified time' };
    }

    const bitmap = await getMediaProxy().getVideoFrame(found.element.src, found.sourceTime, {
      timeoutMs: 30_000,
      priority: 10,
    });

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      try {
        bitmap.close();
      } catch {
        /* ignore */
      }
      return { success: false, error: 'Failed to create canvas context' };
    }

    ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight);
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }

    const dataUrl = canvas.toDataURL(
      mimeFromFormat(outputFormat),
      outputFormat === 'png' ? undefined : Math.max(0, Math.min(1, outputQuality / 100)),
    );

    return {
      success: true,
      data: {
        time,
        width: outputWidth,
        height: outputHeight,
        format: outputFormat,
        image: dataUrlToBase64(dataUrl),
        dataUrl,
        message: 'Frame rendered successfully via Extension FFmpeg (single-track frame)',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to render frame: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Render a video clip for a specific time range
 * 通过 export:* 协议调用 Extension ExportService（FFmpeg）
 */
const renderClip: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { startTime, endTime, format, quality, width, height, fps } = params as {
    startTime: number;
    endTime: number;
    format?: 'mp4' | 'webm';
    quality?: 'low' | 'medium' | 'high';
    width?: number;
    height?: number;
    fps?: number;
  };

  if (startTime === undefined || startTime < 0) {
    return { success: false, error: 'startTime must be a non-negative number' };
  }

  if (endTime === undefined || endTime <= startTime) {
    return { success: false, error: 'endTime must be greater than startTime' };
  }

  const store = useEditorStore.getState();
  const { project } = store;

  if (!project) {
    return { success: false, error: 'No project loaded' };
  }

  // Use project settings if not specified
  const outputWidth = width ?? project.resolution.width;
  const outputHeight = height ?? project.resolution.height;
  const outputFps = fps ?? project.fps;
  const outputFormat = format ?? 'mp4';
  const outputQuality = quality ?? 'medium';

  const duration = endTime - startTime;
  const totalFrames = Math.ceil(duration * outputFps);

  const vscode = getVSCodeAPI();
  if (!vscode) {
    return { success: false, error: 'VSCode API not available' };
  }

  try {
    const requestId = `render_${generateId()}`;
    const settings: ExportSettings = {
      width: outputWidth,
      height: outputHeight,
      fps: outputFps,
      format: outputFormat,
      quality: outputQuality,
      audioBitrate: 192,
      timeRange: { start: startTime, end: endTime },
    };

    const request: ExportRequest = {
      type: 'export:start',
      requestId,
      timestamp: Date.now(),
      payload: {
        project,
        outputPath: `clip_${Date.now()}.${outputFormat}`,
        settings,
      },
    };

    const jobId = await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Render clip start timeout'));
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
          reject(new Error((message as { error?: string }).error ?? 'Render clip failed to start'));
        }
      };

      window.addEventListener('message', handler);
      vscode.postMessage(request);
    });

    activeRenderTasks.set(jobId, {
      status: 'rendering',
      progress: 0,
      totalFrames,
      currentFrame: 0,
    });

    return {
      success: true,
      data: {
        taskId: jobId,
        startTime,
        endTime,
        duration,
        totalFrames,
        width: outputWidth,
        height: outputHeight,
        fps: outputFps,
        format: outputFormat,
        quality: outputQuality,
        status: 'rendering',
        message:
          'Clip rendering started via Extension FFmpeg. Use get_render_progress to check status.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to start clip rendering: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Get a thumbnail image for an element or time point
 * Uses Extension FFmpeg to render the thumbnail
 */
const getThumbnail: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { elementId, time, width, height, format } = params as {
    elementId?: string;
    time?: number;
    width?: number;
    height?: number;
    format?: 'png' | 'jpeg' | 'webp';
  };

  const store = useEditorStore.getState();
  const { project } = store;

  if (!project) {
    return { success: false, error: 'No project loaded' };
  }

  // Default thumbnail size
  const thumbWidth = width ?? 160;
  const thumbHeight = height ?? 90;
  const outputFormat = format ?? 'jpeg';

  let renderTime: number;
  let targetElement: MediaElement | null = null;

  if (elementId) {
    for (const track of project.tracks) {
      const element = track.elements.find((e) => e.id === elementId);
      if (element) {
        if (hasMediaSource(element) && element.type === 'media') {
          targetElement = element as MediaElement;
        }
        break;
      }
    }

    if (!targetElement) {
      return { success: false, error: `Element not found: ${elementId}` };
    }

    const timelineDuration = getClipTimelineDuration(targetElement);
    const requestedTime =
      typeof time === 'number' && Number.isFinite(time)
        ? time
        : targetElement.startTime + timelineDuration / 2;
    renderTime = Math.max(
      targetElement.startTime,
      Math.min(targetElement.startTime + timelineDuration, requestedTime),
    );
  } else if (time !== undefined) {
    renderTime = time;
  } else {
    // Default to first frame
    renderTime = 0;
  }

  if (renderTime < 0) {
    renderTime = 0;
  }

  try {
    // 尝试优先使用 elementId 对应素材；否则按时间点找顶层素材
    let target: { src: string; sourceTime: number } | null = null;
    if (targetElement) {
      target = {
        src: targetElement.src,
        sourceTime: getClipSourceTimeAtDisplayTime(
          targetElement,
          Math.max(0, renderTime - targetElement.startTime),
        ),
      };
    } else {
      const found = findTopmostMediaElementAtTime(project, renderTime);
      if (found) {
        target = { src: found.element.src, sourceTime: found.sourceTime };
      }
    }

    if (!target) {
      return { success: false, error: 'No media element found for thumbnail' };
    }

    const [thumbnail] = await getThumbnailService().getThumbnailsAtTimes(
      target.src,
      [target.sourceTime],
      thumbHeight,
      {
        priority: -10,
      },
    );

    if (!thumbnail) {
      return { success: false, error: 'Failed to capture thumbnail frame' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { success: false, error: 'Failed to create canvas context' };
    }

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load thumbnail frame'));
      image.src = thumbnail.dataUrl;
    });

    ctx.drawImage(image, 0, 0, thumbWidth, thumbHeight);
    const dataUrl = canvas.toDataURL(
      mimeFromFormat(outputFormat),
      outputFormat === 'png' ? undefined : 0.8,
    );

    return {
      success: true,
      data: {
        time: renderTime,
        width: thumbWidth,
        height: thumbHeight,
        format: outputFormat,
        elementId,
        thumbnail: dataUrlToBase64(dataUrl),
        dataUrl,
        message: 'Thumbnail generated successfully via Extension FFmpeg',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Get render progress for a clip rendering task
 */
const getRenderProgress: ToolHandler = async (params): Promise<ToolHandlerResult> => {
  const { taskId } = params as { taskId: string };

  if (!taskId) {
    return { success: false, error: 'taskId is required' };
  }

  const task = activeRenderTasks.get(taskId);

  if (!task) {
    return { success: false, error: `Task not found: ${taskId}` };
  }

  return {
    success: true,
    data: {
      taskId,
      status: task.status,
      progress: task.progress,
      currentFrame: task.currentFrame,
      totalFrames: task.totalFrames,
      error: task.error,
      result: task.result,
    },
  };
};

export const renderHandlers: Record<string, ToolHandler> = {
  RenderFrame: renderFrame,
  RenderClip: renderClip,
  GetThumbnail: getThumbnail,
  GetRenderProgress: getRenderProgress,
};

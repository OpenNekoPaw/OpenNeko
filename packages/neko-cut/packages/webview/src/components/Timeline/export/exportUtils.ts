/**
 * Export helper functions.
 * Extracted from ExportPanel.tsx.
 */

import { postMessage as vscodePostMessage } from '../../../utils/vscodeApi';
import type { ProjectData } from '@neko/shared';

export async function validateProjectMediaFiles(project: ProjectData): Promise<string[]> {
  const missingFiles: string[] = [];
  const checkedPaths = new Set<string>();

  for (const track of project.tracks) {
    if (!track?.elements) continue;

    for (const element of track.elements) {
      if (element.type === 'media' || element.type === 'audio') {
        const filePath = element.src;
        if (!filePath || checkedPaths.has(filePath)) continue;
        checkedPaths.add(filePath);

        try {
          const response = await new Promise<{ exists: boolean }>((resolve) => {
            const messageHandler = (event: MessageEvent) => {
              const message = event.data;
              if (message.type === 'fileValidation' && message.path === filePath) {
                window.removeEventListener('message', messageHandler);
                resolve({ exists: message.exists });
              }
            };
            window.addEventListener('message', messageHandler);

            vscodePostMessage({
              type: 'validateFile',
              path: filePath,
            });

            setTimeout(() => {
              window.removeEventListener('message', messageHandler);
              resolve({ exists: false });
            }, 5000);
          });

          if (!response.exists) {
            missingFiles.push(filePath);
          }
        } catch {
          missingFiles.push(filePath);
        }
      }
    }
  }

  return missingFiles;
}

export function getStageLabel(stage?: string): string {
  const labels: Record<string, string> = {
    initializing: '正在初始化...',
    rendering: '正在渲染帧...',
    encoding: '正在编码视频...',
    muxing: '正在合成音视频...',
    finalizing: '正在保存文件...',
    completed: '导出完成',
    error: '导出失败',
    cancelled: '已取消',
  };
  return labels[stage || ''] || '准备中...';
}

export function formatTimeRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) {
    return `约 ${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `约 ${minutes}分${remainingSeconds}秒` : `约 ${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `约 ${hours}小时${remainingMinutes}分`;
}

export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds} 秒`;
  }
  if (minutes < 60) {
    return `${minutes}分${remainingSeconds.toString().padStart(2, '0')}秒`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes.toString().padStart(2, '0')}分${remainingSeconds.toString().padStart(2, '0')}秒`;
}

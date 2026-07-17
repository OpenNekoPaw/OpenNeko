/**
 * Shared utility functions for TaskCard components
 */

import { CameraIcon, PlayIcon, VolumeIcon } from '@neko/shared/icons';
import type {
  AgentWorkItemStatusTone,
  AgentWorkItemStepRowProjection,
  BackgroundTaskBatchBadgeProjection,
  BackgroundTaskBatchBadgeTone,
} from '@/presenters/work-item-presenter';

export function getToneColor(tone: AgentWorkItemStatusTone): string {
  switch (tone) {
    case 'success':
      return 'var(--agent-success, var(--vscode-charts-green, #89d185))';
    case 'info':
      return 'var(--agent-info, var(--vscode-charts-blue, #3794ff))';
    case 'danger':
      return 'var(--agent-danger, var(--vscode-charts-red, #f14c4c))';
    case 'neutral':
      return 'var(--agent-fg-secondary, var(--vscode-descriptionForeground))';
  }
  return 'var(--agent-fg-secondary, var(--vscode-descriptionForeground))';
}

export function getBatchBadgeToneColor(tone: BackgroundTaskBatchBadgeTone): string {
  switch (tone) {
    case 'success':
      return 'var(--vscode-charts-green, #89d185)';
    case 'info':
      return 'var(--vscode-charts-blue, #3794ff)';
    case 'warning':
      return 'var(--vscode-charts-yellow, #cca700)';
    case 'danger':
      return 'var(--vscode-charts-red, #f14c4c)';
  }
  return 'var(--vscode-descriptionForeground)';
}

export function getBatchHeaderBackground(tone: AgentWorkItemStatusTone): string {
  switch (tone) {
    case 'success':
      return 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-charts-green, #89d185) 15%, transparent), transparent)';
    case 'danger':
      return 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 15%, transparent), transparent)';
    case 'info':
      return 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 15%, transparent), transparent)';
    case 'neutral':
      return 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent), transparent)';
  }
  return 'linear-gradient(90deg, color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent), transparent)';
}

export function getBatchBadgeIcon(
  iconKind: BackgroundTaskBatchBadgeProjection['iconKind'],
): string {
  switch (iconKind) {
    case 'completed':
      return '\u2713';
    case 'processing':
      return '\u23F3';
    case 'queued':
      return '\u23F8';
    case 'failed':
      return '\u2717';
  }
  return '';
}

export function getStepIcon(iconKind: AgentWorkItemStepRowProjection['iconKind']): string {
  switch (iconKind) {
    case 'completed':
      return '\u2713';
    case 'running':
      return '\u25CF';
    case 'failed':
      return '\u2717';
    case 'pending':
      return '\u25CB';
  }
  return '\u25CB';
}

export function getTypeIcon(type: string): string {
  if (type === 'video') return 'Video';
  if (type === 'audio') return 'Audio';
  return 'Image';
}

export function getTaskTypeLabel(type: string): string {
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  return 'image';
}

export function TaskTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'video') return PlayIcon({ className });
  if (type === 'audio') return VolumeIcon({ className });
  return CameraIcon({ className });
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function formatETA(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins}m`;
}

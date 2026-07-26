/**
 * Audio formatting utility functions.
 * Extracted from AudioDiffViewer.tsx.
 */

import { formatMediaTime, formatMediaTimeWithFraction } from '@neko/media';

export function formatTime(seconds: number): string {
  return formatMediaTime(seconds);
}

export function formatDuration(seconds: number): string {
  return formatMediaTimeWithFraction(seconds, 2);
}

export function formatBitrate(bps: number): string {
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

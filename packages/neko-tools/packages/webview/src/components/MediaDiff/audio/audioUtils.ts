/**
 * Audio formatting utility functions.
 * Extracted from AudioDiffViewer.tsx.
 */

import { formatMediaTime, formatTime as formatGenericMediaTime } from '@neko/neko-client';

export function formatTime(seconds: number): string {
  return formatGenericMediaTime(seconds);
}

export function formatDuration(seconds: number): string {
  return formatMediaTime(seconds, { fractionalDigits: 2 });
}

export function formatBitrate(bps: number): string {
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

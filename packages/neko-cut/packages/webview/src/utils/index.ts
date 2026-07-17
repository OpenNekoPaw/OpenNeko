import { formatMediaTime } from '@neko/neko-client';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique ID for elements, tracks, etc.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Format seconds to MM:SS format (for timeline ruler)
 */
export function formatTimeShort(seconds: number): string {
  return formatMediaTime(seconds, { padMinutes: true, rollHoursIntoMinutes: true });
}

/**
 * Format seconds to MM:SS.ms format (for toolbar display)
 */
export function formatTimeFull(seconds: number): string {
  return formatMediaTime(seconds, { fractionalDigits: 2, padMinutes: true });
}

// =============================================================================
// Timeline Calculations
// =============================================================================

/**
 * Calculate effective duration of an element (accounting for trims)
 */
export function getEffectiveDuration(element: {
  duration: number;
  trimStart: number;
  trimEnd: number;
}): number {
  return element.duration - element.trimStart - element.trimEnd;
}

/**
 * Calculate end time of an element
 */
export function getElementEndTime(element: {
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
}): number {
  return element.startTime + getEffectiveDuration(element);
}

/**
 * Check if two time ranges overlap
 */
export function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Check if an element is visible at a given time
 */
export function isElementVisibleAtTime(
  element: {
    startTime: number;
    duration: number;
    trimStart: number;
    trimEnd: number;
    hidden?: boolean;
  },
  time: number,
): boolean {
  if (element.hidden) return false;
  const endTime = getElementEndTime(element);
  return time >= element.startTime && time < endTime;
}

// =============================================================================
// Media Type Detection
// =============================================================================

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];

export type MediaType = 'video' | 'audio' | 'image';
export type FileType = MediaType | 'subtitle';

/**
 * Detect media type from filename
 */
export function getMediaType(filename: string): MediaType | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  return null;
}

/**
 * Detect file type from filename (includes subtitles)
 */
export function getFileType(filename: string): FileType | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (SUBTITLE_EXTENSIONS.includes(ext)) return 'subtitle';
  return null;
}

/**
 * Check if file is a subtitle file
 */
export function isSubtitleFile(filename: string): boolean {
  return getFileType(filename) === 'subtitle';
}

/**
 * Check if file is a video
 */
export function isVideoFile(filename: string): boolean {
  return getMediaType(filename) === 'video';
}

/**
 * Check if file is an image
 */
export function isImageFile(filename: string): boolean {
  return getMediaType(filename) === 'image';
}

/**
 * Check if file is audio
 */
export function isAudioFile(filename: string): boolean {
  return getMediaType(filename) === 'audio';
}

// =============================================================================
// DOM Utilities
// =============================================================================

/**
 * Check if click target is inside an input element
 */
export function isInputElement(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Check if click target has a specific class or is inside an element with that class
 */
export function hasParentWithClass(element: HTMLElement | null, className: string): boolean {
  return element?.closest(`.${className}`) !== null;
}

// =============================================================================
// VSCode API
// =============================================================================

export {
  getVSCodeAPI,
  isVSCodeContext,
  postMessage,
  getState,
  setState,
  sendMessage,
  sendAIAction,
  sendRequest,
  cancelRequest,
  getPendingRequestCount,
  vscodeApi,
} from './vscodeApi';
export type {
  AIActionMessage,
  RequestFileMessage,
  SaveMessage,
  ExportDialogMessage,
  WebviewMessage,
  RequestMessage,
  VSCodeResponseMessage,
} from './vscodeApi';

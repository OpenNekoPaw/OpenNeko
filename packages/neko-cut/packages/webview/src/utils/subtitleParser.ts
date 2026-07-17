/**
 * Subtitle Parser Utilities
 * 字幕解析工具
 *
 * Supports: SRT, VTT, ASS/SSA formats
 */

import type {
  SubtitleCue,
  SubtitleTrack,
  SubtitleStyle,
  SubtitleFormat,
  SubtitleIOOptions,
} from '../types/subtitle';
import {
  createSubtitleCue,
  createSubtitleTrack,
  createDefaultSubtitleStyle,
} from '../types/subtitle';

// =============================================================================
// Time Parsing Utilities
// =============================================================================

/**
 * Parse SRT timestamp to seconds
 * Format: HH:MM:SS,mmm or HH:MM:SS.mmm
 */
function parseSrtTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10) +
    parseInt(milliseconds, 10) / 1000
  );
}

/**
 * Parse VTT timestamp to seconds
 * Format: HH:MM:SS.mmm or MM:SS.mmm
 */
function parseVttTimestamp(timestamp: string): number {
  // Try HH:MM:SS.mmm format
  let match = timestamp.match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const [, hours, minutes, seconds, milliseconds] = match;
    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      parseInt(milliseconds, 10) / 1000
    );
  }

  // Try MM:SS.mmm format
  match = timestamp.match(/(\d{1,2}):(\d{2})\.(\d{3})/);
  if (match) {
    const [, minutes, seconds, milliseconds] = match;
    return parseInt(minutes, 10) * 60 + parseInt(seconds, 10) + parseInt(milliseconds, 10) / 1000;
  }

  return 0;
}

/**
 * Parse ASS timestamp to seconds
 * Format: H:MM:SS.cc (centiseconds)
 */
function parseAssTimestamp(timestamp: string): number {
  const match = timestamp.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, centiseconds] = match;
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10) +
    parseInt(centiseconds, 10) / 100
  );
}

/**
 * Format seconds to SRT timestamp
 */
function formatSrtTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Format seconds to VTT timestamp
 */
function formatVttTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Format seconds to ASS timestamp
 */
function formatAssTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);

  return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

// =============================================================================
// SRT Parser
// =============================================================================

/**
 * Parse SRT subtitle file content
 */
export function parseSrt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    // Parse timestamp line
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(.+?)\s*-->\s*(.+)/);
    if (!timeMatch) continue;

    const startTime = parseSrtTimestamp(timeMatch[1].trim());
    const endTime = parseSrtTimestamp(timeMatch[2].trim());

    // Get text content (all remaining lines)
    const text = lines.slice(2).join('\n').trim();
    if (!text) continue;

    // Remove SRT formatting tags like <b>, <i>, <u>, <font>
    const cleanText = text
      .replace(/<\/?b>/gi, '')
      .replace(/<\/?i>/gi, '')
      .replace(/<\/?u>/gi, '')
      .replace(/<font[^>]*>/gi, '')
      .replace(/<\/font>/gi, '');

    cues.push(createSubtitleCue(startTime, endTime, cleanText));
  }

  return cues;
}

/**
 * Export cues to SRT format
 */
export function exportSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, index) => {
      return `${index + 1}\n${formatSrtTimestamp(cue.startTime)} --> ${formatSrtTimestamp(cue.endTime)}\n${cue.text}`;
    })
    .join('\n\n');
}

// =============================================================================
// VTT Parser
// =============================================================================

/**
 * Parse WebVTT subtitle file content
 */
export function parseVtt(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];

  // Remove WEBVTT header and metadata
  const lines = content.split('\n');
  let startIndex = 0;

  // Skip header
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      startIndex = i;
      break;
    }
  }

  // Process cues
  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Look for timestamp line
    const timeMatch = line.match(/(.+?)\s*-->\s*(.+)/);
    if (timeMatch) {
      const startTime = parseVttTimestamp(timeMatch[1].trim());
      const endTime = parseVttTimestamp(timeMatch[2].split(/\s/)[0].trim());

      // Collect text lines
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }

      if (textLines.length > 0) {
        // Remove VTT tags like <c>, <v>, <b>, <i>, <u>
        const text = textLines
          .join('\n')
          .replace(/<c[^>]*>/gi, '')
          .replace(/<\/c>/gi, '')
          .replace(/<v[^>]*>/gi, '')
          .replace(/<\/v>/gi, '')
          .replace(/<\/?b>/gi, '')
          .replace(/<\/?i>/gi, '')
          .replace(/<\/?u>/gi, '')
          .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, ''); // Remove timestamp tags

        cues.push(createSubtitleCue(startTime, endTime, text));
      }
    }
    i++;
  }

  return cues;
}

/**
 * Export cues to VTT format
 */
export function exportVtt(cues: SubtitleCue[]): string {
  const header = 'WEBVTT\n\n';
  const body = cues
    .map((cue, index) => {
      return `${index + 1}\n${formatVttTimestamp(cue.startTime)} --> ${formatVttTimestamp(cue.endTime)}\n${cue.text}`;
    })
    .join('\n\n');

  return header + body;
}

// =============================================================================
// ASS/SSA Parser
// =============================================================================

/**
 * Parse ASS/SSA subtitle file content
 */
export function parseAss(content: string): { cues: SubtitleCue[]; style?: Partial<SubtitleStyle> } {
  const cues: SubtitleCue[] = [];
  let style: Partial<SubtitleStyle> | undefined;

  const lines = content.split('\n');
  let inEvents = false;
  let formatOrder: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detect section
    if (trimmedLine === '[Events]') {
      inEvents = true;
      continue;
    }
    if (trimmedLine.startsWith('[') && trimmedLine !== '[Events]') {
      inEvents = false;
      continue;
    }

    // Parse style section (simplified)
    if (trimmedLine.startsWith('Style:')) {
      const styleData = trimmedLine.substring(6).split(',');
      if (styleData.length >= 3) {
        style = {
          fontFamily: styleData[1]?.trim(),
          fontSize: parseInt(styleData[2]?.trim() || '32', 10),
        };
      }
    }

    // Parse format line
    if (inEvents && trimmedLine.startsWith('Format:')) {
      formatOrder = trimmedLine
        .substring(7)
        .split(',')
        .map((s) => s.trim().toLowerCase());
      continue;
    }

    // Parse dialogue line
    if (inEvents && trimmedLine.startsWith('Dialogue:')) {
      const dialogueContent = trimmedLine.substring(9);
      const parts = dialogueContent.split(',');

      // Get indices from format order, or use defaults
      const startIndex = formatOrder.indexOf('start');
      const endIndex = formatOrder.indexOf('end');
      const textIndex = formatOrder.indexOf('text');

      const startTimeStr = parts[startIndex >= 0 ? startIndex : 1]?.trim();
      const endTimeStr = parts[endIndex >= 0 ? endIndex : 2]?.trim();

      // Text is everything after the last format field (to handle commas in text)
      const textStartIndex = textIndex >= 0 ? textIndex : 9;
      const text = parts.slice(textStartIndex).join(',').trim();

      if (startTimeStr && endTimeStr && text) {
        const startTime = parseAssTimestamp(startTimeStr);
        const endTime = parseAssTimestamp(endTimeStr);

        // Remove ASS formatting tags like {\b1}, {\i1}, {\pos(x,y)}, etc.
        const cleanText = text
          .replace(/\{[^}]*\}/g, '')
          .replace(/\\N/g, '\n')
          .replace(/\\n/g, '\n')
          .replace(/\\h/g, ' ')
          .trim();

        if (cleanText) {
          cues.push(createSubtitleCue(startTime, endTime, cleanText));
        }
      }
    }
  }

  return { cues, style };
}

/**
 * Export cues to ASS format
 */
export function exportAss(cues: SubtitleCue[], style?: SubtitleStyle): string {
  const s = style || createDefaultSubtitleStyle();

  const header = `[Script Info]
Title: Exported Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${s.fontFamily.split(',')[0]},${s.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map((cue) => {
      const text = cue.text.replace(/\n/g, '\\N');
      return `Dialogue: 0,${formatAssTimestamp(cue.startTime)},${formatAssTimestamp(cue.endTime)},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return header + events;
}

// =============================================================================
// JSON Parser (Native format)
// =============================================================================

/**
 * Parse JSON subtitle format (native)
 */
export function parseJson(content: string): SubtitleTrack | null {
  try {
    const data = JSON.parse(content);
    if (data.cues && Array.isArray(data.cues)) {
      return data as SubtitleTrack;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Export track to JSON format
 */
export function exportJson(track: SubtitleTrack): string {
  return JSON.stringify(track, null, 2);
}

// =============================================================================
// Auto-detect Format
// =============================================================================

/**
 * Auto-detect subtitle format from content
 */
export function detectSubtitleFormat(content: string): SubtitleFormat | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }

  if (
    trimmed.includes('[Script Info]') ||
    trimmed.includes('[V4+ Styles]') ||
    trimmed.includes('[Events]')
  ) {
    return trimmed.includes('[V4+ Styles]') ? 'ass' : 'ssa';
  }

  // Check for SRT format (starts with number, then timestamp)
  const srtPattern = /^\d+\s*\n\d{2}:\d{2}:\d{2}[,.]?\d{3}\s*-->/;
  if (srtPattern.test(trimmed)) {
    return 'srt';
  }

  // Check for JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

// =============================================================================
// Main Import/Export Functions
// =============================================================================

/**
 * Import subtitle file content
 */
export function importSubtitles(
  content: string,
  options?: Partial<SubtitleIOOptions>,
): SubtitleTrack | null {
  const format = options?.format || detectSubtitleFormat(content);
  if (!format) return null;

  const track = createSubtitleTrack('Imported Subtitles');

  switch (format) {
    case 'srt':
      track.cues = parseSrt(content);
      break;
    case 'vtt':
      track.cues = parseVtt(content);
      break;
    case 'ass':
    case 'ssa': {
      const result = parseAss(content);
      track.cues = result.cues;
      if (result.style) {
        track.style = { ...track.style, ...result.style };
      }
      break;
    }
    case 'json':
      return parseJson(content);
    default:
      return null;
  }

  return track.cues.length > 0 ? track : null;
}

/**
 * Export subtitle track to specified format
 */
export function exportSubtitles(track: SubtitleTrack, options: SubtitleIOOptions): string {
  const { format, includeStyles } = options;

  switch (format) {
    case 'srt':
      return exportSrt(track.cues);
    case 'vtt':
      return exportVtt(track.cues);
    case 'ass':
    case 'ssa':
      return exportAss(track.cues, includeStyles ? track.style : undefined);
    case 'json':
      return exportJson(track);
    default:
      return '';
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sort cues by start time
 */
export function sortCues(cues: SubtitleCue[]): SubtitleCue[] {
  return [...cues].sort((a, b) => a.startTime - b.startTime);
}

/**
 * Merge overlapping cues
 */
export function mergeOverlappingCues(cues: SubtitleCue[]): SubtitleCue[] {
  const sorted = sortCues(cues);
  const result: SubtitleCue[] = [];

  for (const cue of sorted) {
    const last = result[result.length - 1];
    if (last && cue.startTime < last.endTime && cue.text === last.text) {
      // Extend the previous cue
      last.endTime = Math.max(last.endTime, cue.endTime);
    } else {
      result.push({ ...cue });
    }
  }

  return result;
}

/**
 * Shift all cue times by offset
 */
export function shiftCueTimes(cues: SubtitleCue[], offsetSeconds: number): SubtitleCue[] {
  return cues.map((cue) => ({
    ...cue,
    startTime: Math.max(0, cue.startTime + offsetSeconds),
    endTime: Math.max(0, cue.endTime + offsetSeconds),
  }));
}

/**
 * Scale cue times by factor
 */
export function scaleCueTimes(cues: SubtitleCue[], factor: number): SubtitleCue[] {
  return cues.map((cue) => ({
    ...cue,
    startTime: cue.startTime * factor,
    endTime: cue.endTime * factor,
  }));
}

/**
 * Get cue at specific time
 */
export function getCueAtTime(cues: SubtitleCue[], time: number): SubtitleCue | null {
  return cues.find((cue) => time >= cue.startTime && time < cue.endTime) || null;
}

/**
 * Get all cues within time range
 */
export function getCuesInRange(
  cues: SubtitleCue[],
  startTime: number,
  endTime: number,
): SubtitleCue[] {
  return cues.filter((cue) => cue.endTime > startTime && cue.startTime < endTime);
}

/**
 * Validate cue timing (no overlaps with different text, proper ordering)
 */
export function validateCues(cues: SubtitleCue[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const sorted = sortCues(cues);

  for (let i = 0; i < sorted.length; i++) {
    const cue = sorted[i];

    // Check for negative or zero duration
    if (cue.endTime <= cue.startTime) {
      errors.push(`Cue ${i + 1}: End time must be after start time`);
    }

    // Check for overlaps with different text
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      if (other.startTime >= cue.endTime) break;

      if (other.startTime < cue.endTime && cue.text !== other.text) {
        errors.push(`Cue ${i + 1} and ${j + 1}: Overlapping cues with different text`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

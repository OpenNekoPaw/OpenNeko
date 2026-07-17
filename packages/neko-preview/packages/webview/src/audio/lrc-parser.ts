/**
 * LRC lyrics parser
 *
 * Parses standard LRC format:
 * - Time tags: [mm:ss.xx] or [mm:ss.xxx]
 * - Multiple time tags per line: [00:01.00][00:15.00]text
 * - Metadata tags: [ti:title] [ar:artist] [al:album] (extracted but optional)
 */

export interface LrcLine {
  /** Time in seconds */
  time: number;
  /** Lyric text */
  text: string;
}

export interface LrcMetadata {
  title?: string;
  artist?: string;
  album?: string;
}

export interface LrcResult {
  lines: LrcLine[];
  metadata: LrcMetadata;
}

const TIME_TAG_RE = /\[(\d{1,3}):(\d{2})(?:\.(\d{2,3}))?\]/g;
const META_TAG_RE = /^\[(ti|ar|al):(.+)\]$/i;

/** Parse a time tag match into seconds */
function parseTime(min: string, sec: string, ms?: string): number {
  const minutes = parseInt(min, 10);
  const seconds = parseInt(sec, 10);
  let millis = 0;
  if (ms) {
    // Normalize to milliseconds: "xx" → xx0, "xxx" → xxx
    millis = ms.length === 2 ? parseInt(ms, 10) * 10 : parseInt(ms, 10);
  }
  return minutes * 60 + seconds + millis / 1000;
}

/** Parse LRC content string into sorted lyric lines + metadata */
export function parseLrc(content: string): LrcResult {
  const lines: LrcLine[] = [];
  const metadata: LrcMetadata = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Check metadata tags
    const metaMatch = META_TAG_RE.exec(trimmed);
    if (metaMatch) {
      const key = metaMatch[1]?.toLowerCase();
      const value = metaMatch[2]?.trim();
      if (key && value) {
        if (key === 'ti') metadata.title = value;
        else if (key === 'ar') metadata.artist = value;
        else if (key === 'al') metadata.album = value;
      }
      continue;
    }

    // Extract all time tags and the remaining text
    const times: number[] = [];
    let lastIndex = 0;
    TIME_TAG_RE.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = TIME_TAG_RE.exec(trimmed)) !== null) {
      const min = match[1];
      const sec = match[2];
      const ms = match[3];
      if (min !== undefined && sec !== undefined) {
        times.push(parseTime(min, sec, ms));
      }
      lastIndex = TIME_TAG_RE.lastIndex;
    }

    if (times.length === 0) continue;

    const text = trimmed.slice(lastIndex).trim();
    // Skip empty lyric lines (instrumental markers)
    if (!text) continue;

    // Each time tag produces a separate line entry
    for (const time of times) {
      lines.push({ time, text });
    }
  }

  // Sort by time ascending
  lines.sort((a, b) => a.time - b.time);

  // If no timed lines found but content has text, treat as plain-text lyrics
  if (lines.length === 0) {
    for (const rawLine of content.split(/\r?\n/)) {
      const text = rawLine.trim();
      if (text && !META_TAG_RE.test(text)) {
        lines.push({ time: -1, text });
      }
    }
  }

  return { lines, metadata };
}

/** Find the index of the current lyric line for a given playback time */
export function findCurrentLineIndex(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;

  // Binary search for the last line with time <= currentTime
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midLine = lines[mid];
    if (midLine && midLine.time <= currentTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

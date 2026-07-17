// =============================================================================
// Timeline Constants
// =============================================================================

/** Pixels per second at zoom level 1.0 */
export const PIXELS_PER_SECOND = 50;

/** Height of each track in pixels */
export const TRACK_HEIGHT = 40;

/** Height of timeline ruler in pixels */
export const RULER_HEIGHT = 30;

/** Width of track labels in pixels (reduced for compact V1/A1 labels) */
export const TRACK_LABEL_WIDTH = 128;

/** Extra pixels to render outside viewport for smooth scrolling */
export const VIRTUALIZATION_BUFFER = 200;

/** Minimum zoom level */
export const MIN_ZOOM = 0.1;

/** Maximum zoom level */
export const MAX_ZOOM = 10;

/** Default zoom level */
export const DEFAULT_ZOOM = 1;

// =============================================================================
// Timeline Panel Constants
// =============================================================================

/** Minimum timeline panel height in pixels */
export const MIN_TIMELINE_HEIGHT = 150;

/** Maximum timeline panel height in pixels */
export const MAX_TIMELINE_HEIGHT = 500;

/** Default timeline panel height in pixels */
export const DEFAULT_TIMELINE_HEIGHT = 256;

// =============================================================================
// Preview Quality Constants (DaVinci Resolve style)
// =============================================================================

/**
 * Preview quality scale factors
 * - 播放时使用选择的质量档位
 * - 暂停时自动使用最高质量 (full)
 */
export const PREVIEW_QUALITY = {
  full: 1, // 100% - Full resolution
  high: 0.75, // 75% resolution
  medium: 0.5, // 50% resolution
  low: 0.25, // 25% resolution
} as const;

export type PreviewQuality = keyof typeof PREVIEW_QUALITY;

/** Preview quality display labels (显示具体数字) */
export const PREVIEW_QUALITY_LABELS: Record<PreviewQuality, string> = {
  full: '1',
  high: '0.75',
  medium: '0.5',
  low: '0.25',
};

// =============================================================================
// Editing Constants
// =============================================================================

/** Snap threshold in seconds */
export const SNAP_THRESHOLD = 0.1;

/** Auto-save debounce delay in milliseconds */
export const AUTO_SAVE_DELAY = 500;

/** Maximum undo history size */
export const MAX_HISTORY_SIZE = 50;

/** Minimum element duration in seconds */
export const MIN_ELEMENT_DURATION = 0.1;

// =============================================================================
// Default Project Values
// =============================================================================

export const DEFAULT_RESOLUTION = {
  width: 1920,
  height: 1080,
} as const;

export const DEFAULT_FPS = 30;

export const DEFAULT_IMAGE_DURATION = 1; // seconds
export const DEFAULT_VIDEO_DURATION = 10; // seconds (placeholder until actual duration is loaded)

// =============================================================================
// Element Colors (for non-theme contexts)
// =============================================================================

export const ELEMENT_COLORS = {
  media: {
    bg: 'bg-blue-600',
    border: 'border-blue-400',
    icon: 'text-blue-400',
  },
  audio: {
    bg: 'bg-green-600',
    border: 'border-green-400',
    icon: 'text-green-400',
  },
  text: {
    bg: 'bg-yellow-600',
    border: 'border-yellow-400',
    icon: 'text-yellow-400',
  },
} as const;

// =============================================================================
// Keyboard Shortcuts Reference
// =============================================================================

export const KEYBOARD_SHORTCUTS = {
  // Playback
  togglePlayback: ' ',
  pause: 'k',
  rewind: 'j',
  forward: 'l',
  frameBack: 'ArrowLeft',
  frameForward: 'ArrowRight',
  goToStart: 'Home',
  goToEnd: 'End',

  // Editing
  undo: 'z',
  redo: 'Z', // Shift+Z
  copy: 'c',
  paste: 'v',
  delete: 'Delete',
  selectAll: 'a',
  deselect: 'Escape',

  // Modes
  toggleSnapping: 'n',
  toggleRipple: 'r',
  toggleFrameAlign: 'f',

  // Split
  split: 's',
  splitKeepLeft: 'q',
  splitKeepRight: 'w',

  // Element toggles
  toggleHidden: 'h',
  toggleMuted: 'm',
} as const;

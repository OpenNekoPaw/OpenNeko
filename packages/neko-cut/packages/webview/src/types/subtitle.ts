/**
 * Subtitle Types
 * 字幕类型定义
 */

// =============================================================================
// Subtitle Style Types
// =============================================================================

/**
 * Font weight options
 */
export type SubtitleFontWeight =
  | 'normal'
  | 'bold'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900';

/**
 * Text alignment options
 */
export type SubtitleAlignment = 'left' | 'center' | 'right';

/**
 * Vertical alignment options
 */
export type SubtitleVerticalAlign = 'top' | 'middle' | 'bottom';

/**
 * Text decoration options
 */
export type SubtitleDecoration = 'none' | 'underline' | 'line-through' | 'overline';

/**
 * Subtitle border style
 */
export type SubtitleBorderStyle = 'none' | 'outline' | 'box' | 'shadow';

/**
 * Subtitle animation type
 */
export type SubtitleAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'typewriter'
  | 'bounce'
  | 'shake';

// =============================================================================
// Subtitle Style Definition
// =============================================================================

/**
 * Complete subtitle style settings
 * 完整的字幕样式设置
 */
export interface SubtitleStyle {
  // ====== Font Properties ======
  /** Font family */
  fontFamily: string;
  /** Font size in pixels */
  fontSize: number;
  /** Font weight */
  fontWeight: SubtitleFontWeight;
  /** Italic style */
  italic: boolean;
  /** Text decoration */
  decoration: SubtitleDecoration;

  // ====== Color Properties ======
  /** Primary text color (hex or rgba) */
  color: string;
  /** Secondary/outline color (hex or rgba) */
  outlineColor: string;
  /** Outline width in pixels */
  outlineWidth: number;
  /** Background color (hex or rgba) */
  backgroundColor: string;
  /** Background padding in pixels */
  backgroundPadding: number;
  /** Background border radius in pixels */
  backgroundRadius: number;

  // ====== Shadow Properties ======
  /** Shadow color (hex or rgba) */
  shadowColor: string;
  /** Shadow X offset */
  shadowOffsetX: number;
  /** Shadow Y offset */
  shadowOffsetY: number;
  /** Shadow blur radius */
  shadowBlur: number;

  // ====== Layout Properties ======
  /** Horizontal alignment */
  alignment: SubtitleAlignment;
  /** Vertical alignment */
  verticalAlign: SubtitleVerticalAlign;
  /** Position X (0-1, relative to video width) */
  positionX: number;
  /** Position Y (0-1, relative to video height) */
  positionY: number;
  /** Line spacing multiplier */
  lineSpacing: number;
  /** Letter spacing in pixels */
  letterSpacing: number;
  /** Maximum width (0-1, relative to video width, 0 = auto) */
  maxWidth: number;

  // ====== Animation Properties ======
  /** Entry animation */
  animationIn: SubtitleAnimation;
  /** Exit animation */
  animationOut: SubtitleAnimation;
  /** Animation duration in ms */
  animationDuration: number;
}

// =============================================================================
// Subtitle Cue (Single Subtitle Entry)
// =============================================================================

/**
 * A single subtitle cue
 * 单个字幕条目
 */
export interface SubtitleCue {
  /** Unique identifier */
  id: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Subtitle text content (can include newlines) */
  text: string;
  /** Optional per-cue style overrides */
  style?: Partial<SubtitleStyle>;
  /** Optional speaker/character name */
  speaker?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Subtitle Track
// =============================================================================

/**
 * A complete subtitle track
 * 完整的字幕轨道
 */
export interface SubtitleTrack {
  /** Unique identifier */
  id: string;
  /** Track name/label */
  name: string;
  /** Language code (e.g., 'en', 'zh-CN', 'ja') */
  language: string;
  /** Whether this is the default track */
  isDefault: boolean;
  /** All subtitle cues in this track */
  cues: SubtitleCue[];
  /** Default style for this track */
  style: SubtitleStyle;
}

// =============================================================================
// Subtitle Format Types
// =============================================================================

/**
 * Supported subtitle file formats
 */
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'json';

/**
 * Subtitle file import/export options
 */
export interface SubtitleIOOptions {
  /** Target format */
  format: SubtitleFormat;
  /** Character encoding */
  encoding?: string;
  /** Whether to include style information (for formats that support it) */
  includeStyles?: boolean;
  /** Frame rate for frame-based formats */
  frameRate?: number;
}

// =============================================================================
// Subtitle Template
// =============================================================================

/**
 * Predefined subtitle style template
 * 预定义字幕样式模板
 */
export interface SubtitleTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Preview thumbnail URL */
  thumbnail?: string;
  /** Category */
  category: 'basic' | 'cinematic' | 'social' | 'news' | 'karaoke' | 'custom';
  /** Style definition */
  style: SubtitleStyle;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default subtitle style
 */
export function createDefaultSubtitleStyle(): SubtitleStyle {
  return {
    // Font
    fontFamily: 'Arial, sans-serif',
    fontSize: 32,
    fontWeight: 'normal',
    italic: false,
    decoration: 'none',

    // Colors
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 2,
    backgroundColor: 'transparent',
    backgroundPadding: 8,
    backgroundRadius: 4,

    // Shadow
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowBlur: 4,

    // Layout
    alignment: 'center',
    verticalAlign: 'bottom',
    positionX: 0.5,
    positionY: 0.9,
    lineSpacing: 1.2,
    letterSpacing: 0,
    maxWidth: 0.9,

    // Animation
    animationIn: 'fade',
    animationOut: 'fade',
    animationDuration: 200,
  };
}

/**
 * Create a new subtitle cue
 */
export function createSubtitleCue(
  startTime: number,
  endTime: number,
  text: string,
  id?: string,
): SubtitleCue {
  return {
    id: id || `cue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    startTime,
    endTime,
    text,
  };
}

/**
 * Create a new subtitle track
 */
export function createSubtitleTrack(
  name: string,
  language: string = 'en',
  id?: string,
): SubtitleTrack {
  return {
    id: id || `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    language,
    isDefault: false,
    cues: [],
    style: createDefaultSubtitleStyle(),
  };
}

// =============================================================================
// Built-in Templates
// =============================================================================

/**
 * Built-in subtitle templates
 */
export const SUBTITLE_TEMPLATES: SubtitleTemplate[] = [
  {
    id: 'default',
    name: 'Default',
    category: 'basic',
    description: 'Clean white text with black outline',
    style: createDefaultSubtitleStyle(),
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    category: 'cinematic',
    description: 'Film-style subtitles with subtle shadow',
    style: {
      ...createDefaultSubtitleStyle(),
      fontFamily: 'Georgia, serif',
      fontSize: 28,
      outlineWidth: 0,
      shadowColor: 'rgba(0, 0, 0, 0.8)',
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      shadowBlur: 6,
      letterSpacing: 1,
    },
  },
  {
    id: 'bold-box',
    name: 'Bold Box',
    category: 'social',
    description: 'Bold text with colored background',
    style: {
      ...createDefaultSubtitleStyle(),
      fontWeight: 'bold',
      fontSize: 36,
      outlineWidth: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backgroundPadding: 12,
      backgroundRadius: 6,
      shadowBlur: 0,
    },
  },
  {
    id: 'news-lower-third',
    name: 'News Lower Third',
    category: 'news',
    description: 'Professional news-style lower third',
    style: {
      ...createDefaultSubtitleStyle(),
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: 'bold',
      fontSize: 28,
      alignment: 'left',
      positionX: 0.05,
      positionY: 0.85,
      maxWidth: 0.6,
      outlineWidth: 0,
      backgroundColor: 'rgba(30, 30, 30, 0.9)',
      backgroundPadding: 16,
      backgroundRadius: 0,
    },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    category: 'karaoke',
    description: 'Colorful karaoke-style text',
    style: {
      ...createDefaultSubtitleStyle(),
      fontWeight: 'bold',
      fontSize: 40,
      color: '#ffff00',
      outlineColor: '#ff6600',
      outlineWidth: 3,
      shadowColor: 'rgba(255, 0, 0, 0.5)',
      shadowBlur: 8,
      verticalAlign: 'middle',
      positionY: 0.5,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    category: 'basic',
    description: 'Simple, clean text without effects',
    style: {
      ...createDefaultSubtitleStyle(),
      fontSize: 24,
      outlineWidth: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      animationIn: 'none',
      animationOut: 'none',
    },
  },
  {
    id: 'youtube',
    name: 'YouTube Style',
    category: 'social',
    description: 'YouTube caption style',
    style: {
      ...createDefaultSubtitleStyle(),
      fontFamily: 'Roboto, Arial, sans-serif',
      fontSize: 32,
      fontWeight: 'normal',
      outlineWidth: 0,
      backgroundColor: 'rgba(8, 8, 8, 0.75)',
      backgroundPadding: 4,
      backgroundRadius: 2,
      shadowBlur: 0,
    },
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    category: 'cinematic',
    description: 'Monospace font with typewriter animation',
    style: {
      ...createDefaultSubtitleStyle(),
      fontFamily: 'Courier New, monospace',
      fontSize: 28,
      letterSpacing: 2,
      animationIn: 'typewriter',
      animationOut: 'fade',
      animationDuration: 50,
    },
  },
];

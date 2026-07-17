// =============================================================================
// Subtitle Types
// =============================================================================

/** Subtitle style settings */
export interface SubtitleStyle {
  /** Font family */
  fontFamily: string;
  /** Font size in pixels */
  fontSize: number;
  /** Font weight */
  fontWeight:
    'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  /** Italic style */
  italic: boolean;
  /** Primary text color (hex or rgba) */
  color: string;
  /** Outline color */
  outlineColor: string;
  /** Outline width in pixels */
  outlineWidth: number;
  /** Background color */
  backgroundColor: string;
  /** Horizontal alignment */
  alignment: 'left' | 'center' | 'right';
  /** Vertical alignment */
  verticalAlign: 'top' | 'middle' | 'bottom';
  /** Position Y (0-1, relative to video height) */
  positionY: number;
}

/** Single subtitle cue */
export interface SubtitleCue {
  /** Unique identifier */
  id: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Subtitle text content */
  text: string;
  /** Optional per-cue style overrides */
  style?: Partial<SubtitleStyle>;
}

/** Subtitle track */
export interface SubtitleTrack {
  /** Unique identifier */
  id: string;
  /** Track name/label */
  name: string;
  /** Language code (e.g., 'en', 'zh-CN') */
  language: string;
  /** Whether this is the default track */
  isDefault: boolean;
  /** All subtitle cues */
  cues: SubtitleCue[];
  /** Default style for this track */
  style: SubtitleStyle;
}

/** Supported subtitle file formats */
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'json';

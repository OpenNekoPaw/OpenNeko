// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
//
// Source: packages/neko-proto/timeline.proto
// Source hash: 27c1eea507bbf7f2
// Command: node scripts/proto-gen-ts.mjs
// =============================================================================

// =============================================================================
// Enums
// =============================================================================

export type EngineTrackType =
  'video' | 'audio' | 'text' | 'effect' | 'subtitle' | 'shape' | 'media';

export type EngineBlendMode =
  | 'normal'
  | 'dissolve'
  | 'darken'
  | 'multiply'
  | 'colorBurn'
  | 'linearBurn'
  | 'darkerColor'
  | 'lighten'
  | 'screen'
  | 'colorDodge'
  | 'linearDodge'
  | 'lighterColor'
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'vividLight'
  | 'linearLight'
  | 'pinLight'
  | 'hardMix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type EngineTransitionType =
  | 'fade'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'iris-circle'
  | 'iris-rectangle'
  | 'clock'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'dissolve'
  | 'pixelate'
  | 'ripple'
  | 'swirl'
  | 'glitch'
  | 'flash';

export type EngineEasingType =
  | 'linear'
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-out-quad'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic'
  | 'ease-in-quart'
  | 'ease-out-quart'
  | 'ease-in-out-quart'
  | 'ease-in-quint'
  | 'ease-out-quint'
  | 'ease-in-out-quint'
  | 'ease-in-sine'
  | 'ease-out-sine'
  | 'ease-in-out-sine'
  | 'ease-in-expo'
  | 'ease-out-expo'
  | 'ease-in-out-expo'
  | 'ease-in-circ'
  | 'ease-out-circ'
  | 'ease-in-out-circ'
  | 'ease-in-back'
  | 'ease-out-back'
  | 'ease-in-out-back'
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-in-out-elastic'
  | 'ease-in-bounce'
  | 'ease-out-bounce'
  | 'ease-in-out-bounce'
  | 'cubic-bezier';

export type EngineInterpolationMode = 'linear' | 'step' | 'smooth';

export type EngineEffectType =
  | 'blur'
  | 'sharpen'
  | 'colorCorrection'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'exposure'
  | 'gamma'
  | 'vignette'
  | 'chromaticAberration'
  | 'filmGrain'
  | 'custom';

// =============================================================================
// Messages
// =============================================================================

export interface EngineTransform {
  /** Position X (pixels or normalized, depends on context) (default: 0.0) */
  x: number;
  /** Position Y (pixels or normalized) (default: 0.0) */
  y: number;
  /** Scale X (1.0 = 100%) (default: 1.0) */
  scaleX: number;
  /** Scale Y (1.0 = 100%) (default: 1.0) */
  scaleY: number;
  /** Rotation in degrees (default: 0.0) */
  rotation: number;
  /** Anchor point X (0.0 = left, 0.5 = center, 1.0 = right) (default: 0.0) */
  anchorX: number;
  /** Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom) (default: 0.0) */
  anchorY: number;
}

export interface EngineEffectParams {
  /** Effect type */
  effectType: EngineEffectType;
  /** Effect intensity (0.0 - 1.0) (default: 1.0) */
  intensity: number;
  /** Effect-specific parameters (JSON blob) */
  paramsJson: string;
  /** Whether effect is enabled (default: true) */
  enabled: boolean;
}

export interface EngineAudioProperties {
  /** Volume (0.0 - 1.0) (default: 1.0) */
  volume: number;
  /** Pan (-1.0 = left, 0.0 = center, 1.0 = right) (default: 0.0) */
  pan: number;
  /** Whether audio is muted (default: false) */
  muted: boolean;
  /** Fade in duration (seconds) (default: 0.0) */
  fadeIn: number;
  /** Fade out duration (seconds) (default: 0.0) */
  fadeOut: number;
  /** Fade in easing curve (Phase 3) (default: LINEAR) */
  fadeInCurve: EngineEasingType;
  /** Fade out easing curve (Phase 3) (default: LINEAR) */
  fadeOutCurve: EngineEasingType;
  /** Gain adjustment in dB (Phase 3), -20 to +20 (default: 0.0) */
  gain: number;
}

export interface EngineMediaElementData {
  /** Source file path */
  src: string;
  /** Resource ID (deterministic hash) */
  resourceId?: string;
  /** Audio properties (for video with audio) */
  audio?: EngineAudioProperties;
  /** Media type (video/image) */
  mediaType?: string;
  /** Linked audio element ID */
  linkedAudioId?: string;
  /** DEPRECATED: use AudioProperties audio field instead (default: 1.0) */
  volume: number;
}

export interface EngineAudioElementData {
  /** Source file path */
  src: string;
  /** Resource ID */
  resourceId?: string;
  /** Audio properties (legacy nested format) */
  audio?: EngineAudioProperties;
  /** Linked video element ID */
  linkedVideoId?: string;
  /** Audio settings (JVI nested format with baseValue) */
  audioSettings?: EngineAudioSettings;
  /** DEPRECATED: use AudioProperties audio field instead (default: 1.0) */
  volume: number;
  /** DEPRECATED: use AudioProperties audio field instead (default: 0.0) */
  pan: number;
  /** DEPRECATED: use AudioProperties audio field instead (default: 0.0) */
  fadeIn: number;
  /** DEPRECATED: use AudioProperties audio field instead (default: 0.0) */
  fadeOut: number;
}

/** Audio settings (JVI nested format with baseValue) */
export interface EngineAudioSettings {
  /** Volume setting */
  volume?: EngineAudioValue;
  /** Pan setting */
  pan?: EngineAudioValue;
  /** Whether audio is muted (default: false) */
  muted: boolean;
}

/** Audio value with baseValue (JVI format) */
export interface EngineAudioValue {
  /** Base value */
  baseValue: number;
}

export interface EngineTextElementData {
  /** Text content */
  content: string;
  /** Font family (default: "Arial") */
  fontFamily: string;
  /** Font size in pixels (default: 48.0) */
  fontSize: number;
  /** Text color (hex) (default: "#ffffff") */
  color: string;
  /** Background color (default: "transparent") */
  backgroundColor: string;
  /** Text alignment (default: "center") */
  textAlign: string;
  /** Font weight (default: "normal") */
  fontWeight: string;
  /** Font style (default: "normal") */
  fontStyle: string;
  /** Text decoration (Phase 2): "none" | "underline" | "line-through" (default: "none") */
  textDecoration: string;
  /** Line height multiplier (Phase 2) (default: 1.2) */
  lineHeight: number;
  /** Letter spacing in pixels (Phase 2) (default: 0.0) */
  letterSpacing: number;
  /** Stroke color hex (Phase 2) (default: "transparent") */
  strokeColor: string;
  /** Stroke width in pixels (Phase 2) (default: 0.0) */
  strokeWidth: number;
  /** Drop shadow (Phase 2) */
  shadow?: EngineTextShadow;
}

/** Text shadow properties (Phase 2) */
export interface EngineTextShadow {
  /** Shadow color (default: "rgba(0,0,0,0.5)") */
  color: string;
  /** Horizontal offset (default: 0.0) */
  offsetX: number;
  /** Vertical offset (default: 0.0) */
  offsetY: number;
  /** Blur radius (default: 0.0) */
  blur: number;
}

export interface EngineShapeElementData {
  /** Shape type */
  shapeType: string;
  /** Fill color */
  fill: string;
  /** Stroke color */
  stroke: string;
  /** Stroke width */
  strokeWidth: number;
}

export interface EngineSubtitleElementData {
  /** Subtitle text */
  text: string;
  /** Font size (default: 48.0) */
  fontSize: number;
  /** Text color (default: "#ffffff") */
  color: string;
  /** Font family (Phase 2) (default: "Arial") */
  fontFamily: string;
  /** Background color (Phase 2) (default: "transparent") */
  backgroundColor: string;
  /** Text alignment (Phase 2) (default: "center") */
  textAlign: string;
  /** Stroke color hex (Phase 2) (default: "transparent") */
  strokeColor: string;
  /** Stroke width in pixels (Phase 2) (default: 0.0) */
  strokeWidth: number;
  /** Drop shadow (Phase 2) */
  shadow?: EngineTextShadow;
}

export interface EngineElement {
  /** Element ID */
  id: string;
  /** Element name */
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  transform?: EngineTransform;
  opacity: number;
  blendMode: EngineBlendMode;
  effects: EngineEffectParams[];
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  speed?: EngineSpeedProperties;
  transitionIn?: EngineTransition;
  transitionOut?: EngineTransition;
  lineage?: EngineClipLineage;
  media?: EngineMediaElementData;
  audio?: EngineAudioElementData;
  text?: EngineTextElementData;
  shape?: EngineShapeElementData;
  subtitle?: EngineSubtitleElementData;
}

/**
 * Links a timeline element back to its creation context so users can
 * answer "where did this clip come from?" and agents can safely re-run
 * the generating flow with the same inputs.
 */
export interface EngineClipLineage {
  /**
   * Source ShotCanvasNode.id (canvas shot that produced this clip).
   * Empty string when clip was authored directly in the timeline.
   */
  shotNodeId: string;
  /**
   * Generation task id (MediaGenerationService.generate -> taskId).
   * Empty string when no AI generation was involved (pure render / import).
   */
  generationId: string;
  /**
   * NkPlan id that orchestrated the generation.
   * Empty string when the shot was generated outside a workflow plan.
   */
  planId: string;
  /**
   * RouteLevel the plan ran at (L0..L4, see agent-unified-workflow.md).
   * Empty string when unset.
   */
  routeLevel: string;
  /** Unix millis — when this lineage was recorded. */
  recordedAt: number;
}

export interface EngineSpeedProperties {
  /**
   * Playback speed (0.1 - 4.0, default: 1.0)
   * When speed != 1.0, element.duration represents timeline duration (what viewer sees).
   * Source media range = duration * speed. (default: 1.0)
   */
  speed: number;
  /** Whether playback is reversed (default: false) */
  reverse: boolean;
  /** Whether to preserve audio pitch when changing speed (default: true) */
  preservePitch: boolean;
  /** Time remap data (for complex speed changes) */
  timeRemap?: EngineTimeRemapData;
}

export interface EngineTimeRemapData {
  /** Whether time remapping is enabled */
  enabled: boolean;
  /** Keyframes for time remapping */
  keyframes: EngineTimeRemapKeyframe[];
}

export interface EngineTimeRemapKeyframe {
  /** Unique identifier */
  id: string;
  /** Output time (position on timeline) */
  outputTime: number;
  /** Input time (position in source media) */
  inputTime: number;
  /** Easing to next keyframe */
  easing: EngineEasingType;
}

export interface EngineTransition {
  /** Transition type */
  transitionType: EngineTransitionType;
  /** Duration in seconds */
  duration: number;
  /** Easing function for progress */
  easing: EngineEasingType;
  /** Edge feather/softness (0.0 - 1.0) (default: 0.0) */
  feather: number;
}

export interface EngineTrack {
  /** Track ID */
  id: string;
  /** Track name */
  name: string;
  /** Track type */
  trackType: EngineTrackType;
  /** Elements in the track */
  elements: EngineElement[];
  /** Whether track is muted (default: false) */
  muted: boolean;
  /** Whether track is locked (default: false) */
  locked: boolean;
  /** Whether track is hidden (default: false) */
  hidden: boolean;
  /** Whether this is the main track (default: false) */
  isMain: boolean;
}

export interface EngineTimeline {
  /** Total duration in seconds */
  duration: number;
  /** Output resolution */
  resolution?: EngineResolution;
  /** Frame rate */
  fps: number;
  /** Tracks in the timeline */
  tracks: EngineTrack[];
  /** Project defaults */
  defaults?: EngineProjectDefaults;
}

export interface EngineResolution {
  width: number;
  height: number;
}

export interface EngineProjectDefaults {
  text?: EngineTextDefaults;
  transform?: EngineTransformDefaults;
  audio?: EngineAudioDefaults;
}

export interface EngineTextDefaults {
  /** default: 48.0 */
  fontSize: number;
  /** default: "Arial" */
  fontFamily: string;
  /** default: "#ffffff" */
  color: string;
}

export interface EngineTransformDefaults {
  x: number;
  y: number;
  /** default: 1.0 */
  scaleX: number;
  /** default: 1.0 */
  scaleY: number;
  rotation: number;
}

export interface EngineAudioDefaults {
  /** default: 1.0 */
  volume: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
}

export interface EngineAnimatableValue {
  number?: number;
  point2d?: EnginePoint2D;
  point3d?: EnginePoint3D;
  color?: EngineColorValue;
  boolValue?: boolean;
}

export interface EnginePoint2D {
  x: number;
  y: number;
}

export interface EnginePoint3D {
  x: number;
  y: number;
  z: number;
}

export interface EngineColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface EngineKeyframe {
  /** Time in seconds from clip/animation start */
  time: number;
  /** Value at this keyframe */
  value?: EngineAnimatableValue;
  /** Easing to next keyframe */
  easing: EngineEasingType;
  /** Interpolation mode */
  interpolation: EngineInterpolationMode;
}

export interface EngineKeyframeTrack {
  /** Property name (e.g., "opacity", "positionX", "scale") */
  property: string;
  /** Keyframes sorted by time */
  keyframes: EngineKeyframe[];
  /** Default value when no keyframes */
  defaultValue?: EngineAnimatableValue;
}

export interface EngineCubicBezierParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// =============================================================================
// Key Constants (for whitelist-based engine field extraction)
// =============================================================================

export const ENGINE_BASE_ELEMENT_KEYS = [
  'id',
  'name',
  'startTime',
  'duration',
  'trimStart',
  'trimEnd',
  'transform',
  'opacity',
  'blendMode',
  'effects',
  'muted',
  'hidden',
  'locked',
  'speed',
  'transitionIn',
  'transitionOut',
  'lineage',
] as const;

export const ENGINE_MEDIA_KEYS = [
  'src',
  'resourceId',
  'audio',
  'mediaType',
  'linkedAudioId',
  'volume',
] as const;

export const ENGINE_AUDIO_KEYS = [
  'src',
  'resourceId',
  'audio',
  'linkedVideoId',
  'audioSettings',
  'volume',
  'pan',
  'fadeIn',
  'fadeOut',
] as const;

export const ENGINE_TEXT_KEYS = [
  'content',
  'fontFamily',
  'fontSize',
  'color',
  'backgroundColor',
  'textAlign',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'lineHeight',
  'letterSpacing',
  'strokeColor',
  'strokeWidth',
  'shadow',
] as const;

export const ENGINE_SHAPE_KEYS = ['shapeType', 'fill', 'stroke', 'strokeWidth'] as const;

export const ENGINE_SUBTITLE_KEYS = [
  'text',
  'fontSize',
  'color',
  'fontFamily',
  'backgroundColor',
  'textAlign',
  'strokeColor',
  'strokeWidth',
  'shadow',
] as const;

export const ENGINE_TRACK_KEYS = [
  'id',
  'name',
  'trackType',
  'elements',
  'muted',
  'locked',
  'hidden',
  'isMain',
] as const;

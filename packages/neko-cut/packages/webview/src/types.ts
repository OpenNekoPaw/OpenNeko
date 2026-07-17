// =============================================================================
// Unified Types - Re-export from shared package
// 统一类型 - 从 shared 包重新导出
//
// IMPORTANT: TimelineElement and TimelineTrack are re-exported as extended
// editor types that include UI-only fields (animTransform, masks, solo, etc.).
// See types/editor-types.ts for details.
// =============================================================================

// Re-export editor-extended element/track types (engine + UI fields)
export type {
  EditorElement as TimelineElement,
  EditorTrack as TimelineTrack,
  EditorElement,
  EditorMediaElement,
  EditorAudioElement,
  EditorTextElement,
  EditorShapeElement,
  EditorSubtitleElement,
  EditorTrack,
} from './types/editor-types';
export { toEngineElement, toEngineTrack } from './types/editor-types';

// Re-export core types from shared package (engine-aligned)
export type {
  // Track types
  TrackType,
  // Timeline element subtypes (engine-aligned)
  MediaElement,
  TextElement,
  AudioElement,
  ShapeElement,
  // Project
  ProjectData,
  ProjectDefaults,
  // Transform
  Transform,
  // Easing
  EasingType,
  // Blend modes
  BlendModeType,
  // Transitions
  Transition,
  TransitionType,
  TransitionDirection,
  TransitionParams,
  ElementTransition,
  TransitionPlacement,
  // Effects
  EffectType,
  EffectCategory,
  EffectParameterType,
  EffectParameterValue,
  EffectParameterKeyframe,
  AnimatableEffectParameter,
  EffectInstance,
  // Audio
  AudioProperties,
  SpeedProperties,
  // Shapes
  ShapeType,
  Shape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
  BezierShape,
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  ShapeStyle,
  ShapeInstance,
  GradientFill,
  GradientStop,
  GradientType,
  FillType,
  StrokeLineCap,
  StrokeLineJoin,
  // Geometry
  Point2D,
  BezierPoint,
  // Subtitles
  SubtitleTrack,
  SubtitleCue,
  SubtitleStyle,
  SubtitleFormat,
  // Messages
  MessageToWebview,
  MessageFromWebview,
  ExportProgressInfo,
  // AI Actions
  AIActionElementType,
  AIActionCapability,
  AIQuickAction,
} from '@neko/shared';

// Re-export AI action helpers
export { AI_ACTIONS, getActionsForElementType, mapElementTypeToAIType } from '@neko/shared';

// Re-export constants and functions from shared (engine-aligned)
export {
  // Transform defaults
  CENTERED_TRANSFORM,
  ENGINE_DEFAULT_TRANSFORM,
  // Audio defaults
  DEFAULT_AUDIO_PROPERTIES,
  // Shape defaults
  DEFAULT_SHAPE_FILL,
  DEFAULT_SHAPE_STROKE,
  DEFAULT_SHAPE_SHADOW,
  DEFAULT_SHAPE_STYLE,
} from '@neko/shared';

// Migrated UI types — canonical source is now local
export type {
  BezierHandle,
  AnimationKeyframe,
  AnimatableProperty,
  AnimatablePropertyName,
  ElementTransform,
  ComputedTransform,
} from './types/animation';
export { createAnimatableProperty, createDefaultElementTransform } from './types/animation';
export type {
  ColorCorrection,
  BasicColorAdjustment,
  CurvesAdjustment,
  CurveAdjustment,
  CurvePoint,
  CurveChannel,
  HSLAdjustment,
  HSLRangeAdjustment,
  HSLColorRange,
  LUTAdjustment,
  VignetteParams,
  ColorWheelsParams,
  ColorWheelValue,
} from './types/colorCorrection';
export {
  DEFAULT_BASIC_COLOR_ADJUSTMENT,
  DEFAULT_CURVE,
  DEFAULT_CURVES_ADJUSTMENT,
  DEFAULT_HSL_RANGE,
  DEFAULT_HSL_ADJUSTMENT,
  DEFAULT_LUT_ADJUSTMENT,
  DEFAULT_VIGNETTE_PARAMS,
  DEFAULT_COLOR_WHEEL_VALUE,
  DEFAULT_COLOR_WHEELS_PARAMS,
  DEFAULT_COLOR_CORRECTION,
} from './types/colorCorrection';
export type {
  MaskShape,
  MaskShapeType,
  MaskInstance,
  MaskAnimationData,
  MaskEasingType,
  MaskShapeKeyframe,
  MaskPropertyKeyframe,
  AnimatableMaskProperty,
} from './types/mask';
export type { KeyframeTrack, Keyframe, KeyframeableProperty } from './types/keyframe';
export type { TrackUIState, ElementEditState } from './types/ui-state';
export { DEFAULT_TRACK_UI_STATE, DEFAULT_ELEMENT_EDIT_STATE } from './types/ui-state';

// =============================================================================
// Re-export Types from Local Modules (webview-specific extensions)
// =============================================================================

// Transition types (local extensions)
export type { TransitionPreset, TransitionCategory } from './types/transition';

// Re-export transition utilities
export {
  TRANSITION_TYPE_I18N_KEYS,
  TRANSITION_ICONS,
  TRANSITION_PRESETS,
  createTransition,
  createElementTransition,
  createTransitionFromPreset,
  getTransitionIcon,
  isDirectionalTransition,
  getOppositeTransition,
  getTransitionCategory,
} from './types/transition';

// Color correction types (local extensions)
export type { ColorCorrectionPreset } from './types/colorCorrection';

// Effect types (local extensions)
export type { EffectDefinition } from './types/effects';

// Subtitle types (local extensions)
export type { SubtitleTemplate } from './types/subtitle';

// Blend mode types (local extensions)
export type { BlendModeCategory, BlendModeDefinition } from './types/blendModes';

// Re-export shape factory functions (local implementations)
export {
  createRectangleShape,
  createEllipseShape,
  createPolygonShape,
  createStarShape,
  createLineShape,
  createBezierShape,
  createDefaultFill,
  createDefaultStroke,
  createDefaultShadow,
  createDefaultShapeStyle,
  createShapeInstance,
  cloneShapeInstance,
  getShapeBounds,
  isPointInShape,
  generateStarPoints,
  isRectangleShape,
  isEllipseShape,
  isPolygonShape,
  isStarShape,
  isLineShape,
  isBezierShape,
} from './types/shape';

// Re-export capability interfaces
export type {
  ITimelineElementBase,
  IAnimatable,
  IAudioCapable,
  IEffectable,
  IMediaSource,
} from './types/capabilities';

// Re-export utility functions
export {
  isAnimatable,
  isAudioCapable,
  isEffectable,
  hasMediaSource,
  getEffectiveDuration,
  getElementEndTime,
  isTimeInElement,
} from './types/capabilities';

// =============================================================================
// All Timeline Element (includes shapes)
// =============================================================================

import type { TimelineElement, ShapeElement } from '@neko/shared';

/**
 * All timeline element types including shapes
 */
export type AllTimelineElement = TimelineElement | ShapeElement;

// =============================================================================
// VSCode API Type (re-export from shared)
// =============================================================================

export type { VSCodeAPI } from '@neko/shared/vscode';

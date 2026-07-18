// =============================================================================
// Timeline Elements — Aligned with Engine (domain/timeline.rs → Element)
//
// Authority: packages/neko-proto/timeline.proto → Element
// Engine fields on Element: id, name, elementType, startTime, duration,
//   trimStart, trimEnd, transform, opacity, blendMode, effects, muted,
//   hidden, locked, speed, transitionIn, transitionOut
// UI-only fields (animTransform, colorCorrection, masks, keyframes)
//   have been moved to ui-state.ts → ElementEditState
// =============================================================================

import { Transform } from './transform';
import { BlendModeType } from './blendMode';
import { AudioProperties } from './audio';
import { EffectInstance } from './effects';
import { SpeedProperties } from './speed';
import { Transition } from './transition';
import type {
  EngineClipLineage,
  EngineElement,
  EngineSubtitleElementData,
} from '../generated/timeline.engine';

// =============================================================================
// Compile-time drift detection
// =============================================================================

/**
 * Asserts that all keys of A exist in B.
 * If EngineElement gains a new field not present in BaseTimelineElement,
 * this type resolves to an error object and the const assignment below fails.
 */
type AssertKeysSubset<A, B> =
  Exclude<keyof A, keyof B> extends never
    ? true
    : {
        error: 'Engine type has fields missing from hand-written type';
        fields: Exclude<keyof A, keyof B>;
      };

// Omit oneof fields (media/audio/text/shape/subtitle) — these are
// element-type-specific data, not base element properties.
type _CheckBaseElement = AssertKeysSubset<
  Omit<EngineElement, 'media' | 'audio' | 'text' | 'shape' | 'subtitle'>,
  BaseTimelineElement
>;
type _CheckSubtitle = AssertKeysSubset<EngineSubtitleElementData, SubtitleElement>;

// Compile-time drift detection: assignment fails if engine type has new fields.
// void usage prevents TS6133 (noUnusedLocals) without exporting internals.
const _driftCheckElement: _CheckBaseElement = true;
const _driftCheckSubtitle: _CheckSubtitle = true;
void _driftCheckElement;
void _driftCheckSubtitle;

// =============================================================================
// Base Element — Engine-aligned fields only
// =============================================================================

interface BaseTimelineElement {
  /** Element ID */
  id: string;
  /** Element name */
  name: string;
  /** Duration on timeline (seconds) */
  duration: number;
  /** Start time on timeline (seconds) */
  startTime: number;
  /** Trim from start (seconds into source) */
  trimStart: number;
  /** Trim from end (seconds from source end) */
  trimEnd: number;
  /** 2D transform (engine has default: identity) */
  transform: Transform;
  /** Opacity (0.0-1.0, engine default: 1.0) */
  opacity: number;
  /** Blend mode (engine default: 'normal') */
  blendMode: BlendModeType;
  /** Applied effects */
  effects: EffectInstance[];
  /** Whether element is muted */
  muted: boolean;
  /** Whether element is hidden */
  hidden: boolean;
  /** Whether element is locked */
  locked: boolean;
  /** Audio properties (for media/audio elements) */
  audio?: AudioProperties;
  /** Speed properties (Phase 1: engine field) */
  speed?: SpeedProperties;
  /** Transition from previous element (Phase 2: engine field) */
  transitionIn?: Transition;
  /** Transition to next element (Phase 2: engine field) */
  transitionOut?: Transition;
  /**
   * Workflow-Orchestration lineage (Phase 6.3: engine field).
   *
   * Provenance breadcrumb back to the canvas shot / generation task /
   * plan that produced this element.  Populated by the arrange-on-timeline
   * stage when the pipeline is orchestrator-driven; empty for clips
   * authored directly on the timeline.  Uses the generated type as-is
   * (no UI rename needed — fields are already camelCase + user-meaningful).
   */
  lineage?: EngineClipLineage;
}

// =============================================================================
// Concrete Element Types — Aligned with Engine's ElementType enum
// =============================================================================

export interface MediaElement extends BaseTimelineElement {
  type: 'media';
  /** Source file path */
  src: string;
  /** Resource ID (deterministic hash) */
  resourceId?: string;
  /** Media type hint (video/image) */
  mediaType?: 'video' | 'image';
  /** Linked audio element ID */
  linkedAudioId?: string;
}

export interface AudioElement extends BaseTimelineElement {
  type: 'audio';
  /** Source file path */
  src: string;
  /** Resource ID */
  resourceId?: string;
  /** Linked video element ID */
  linkedVideoId?: string;
}

export interface TextElement extends BaseTimelineElement {
  type: 'text';
  /** Text content */
  content: string;
  /** Font size in pixels (engine default: 48) */
  fontSize: number;
  /** Font family (engine default: "Arial") */
  fontFamily: string;
  /** Text color hex (engine default: "#ffffff") */
  color: string;
  /** Background color (engine default: "transparent") */
  backgroundColor: string;
  /** Text alignment (engine default: "center") */
  textAlign: 'left' | 'center' | 'right';
  /** Font weight (engine default: "normal") */
  fontWeight: 'normal' | 'bold';
  /** Font style (engine default: "normal") */
  fontStyle: 'normal' | 'italic';
  /** Text decoration (engine field, Phase 2): "none" | "underline" | "line-through" */
  textDecoration?: 'none' | 'underline' | 'line-through';
  /** Line height multiplier (engine field, Phase 2, default: 1.2) */
  lineHeight?: number;
  /** Letter spacing in pixels (engine field, Phase 2, default: 0) */
  letterSpacing?: number;
  /** Text stroke color (engine field, Phase 2, default: "transparent") */
  strokeColor?: string;
  /** Text stroke width (engine field, Phase 2, default: 0) */
  strokeWidth?: number;
  /** Drop shadow (engine field, Phase 2) */
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
}

export interface ShapeElement extends BaseTimelineElement {
  type: 'shape';
  /** Shape type (engine field) */
  shapeType: string;
  /** Fill color (engine field) */
  fill: string;
  /** Stroke color (engine field) */
  stroke: string;
  /** Stroke width (engine field) */
  strokeWidth: number;
}

export interface SubtitleElement extends BaseTimelineElement {
  type: 'subtitle';
  /** Subtitle text (engine field) */
  text: string;
  /** Font size in pixels (engine field, default: 48) */
  fontSize: number;
  /** Text color hex (engine field, default: "#ffffff") */
  color: string;
  /** Font family (engine field, Phase 2, default: "Arial") */
  fontFamily: string;
  /** Background color (engine field, Phase 2, default: "transparent") */
  backgroundColor: string;
  /** Text alignment (engine field, Phase 2, default: "center") */
  textAlign: string;
  /** Stroke color hex (engine field, Phase 2, default: "transparent") */
  strokeColor: string;
  /** Stroke width in pixels (engine field, Phase 2, default: 0) */
  strokeWidth: number;
  /** Drop shadow (engine field, Phase 2) */
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
}

export type TimelineElement =
  MediaElement | TextElement | AudioElement | ShapeElement | SubtitleElement;

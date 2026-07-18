/**
 * Editor Types — Webview-local extended types
 *
 * These types extend the engine-aligned @neko/shared types with UI-only fields
 * that the editor needs but the engine doesn't recognize.
 *
 * Architecture:
 *   @neko/shared (engine-aligned)     →  TimelineElement (12 fields)
 *   webview/editor-types.ts (this)    →  EditorElement = TimelineElement & ElementEditState
 *
 * The editor stores EditorElement objects in project.tracks[].elements[].
 * When sending to the engine, only the base TimelineElement fields are extracted.
 * The UI-only fields (animTransform, colorCorrection, masks, etc.) are stripped.
 *
 * This approach avoids a massive refactor of the Store while keeping
 * @neko/shared types clean and engine-aligned.
 */

import type {
  TimelineElement,
  MediaElement,
  AudioElement,
  TextElement,
  ShapeElement,
  SubtitleElement,
  TimelineTrack,
} from '@neko/shared';
import type { ElementEditState, TrackUIState } from './ui-state';

import {
  ENGINE_BASE_ELEMENT_KEYS,
  ENGINE_MEDIA_KEYS,
  ENGINE_AUDIO_KEYS,
  ENGINE_TEXT_KEYS,
  ENGINE_SHAPE_KEYS,
  ENGINE_SUBTITLE_KEYS,
  ENGINE_TRACK_KEYS,
} from '@neko/shared';

// =============================================================================
// Extended Element Types (Engine fields + UI fields)
// =============================================================================

/**
 * Editor element — TimelineElement with optional UI edit state fields.
 *
 * Used throughout the webview Store and components.
 * The UI fields are stored directly on the element for convenience,
 * but are NOT sent to the engine.
 */
export type EditorElement = TimelineElement & Partial<ElementEditState>;

/** Editor media element */
export type EditorMediaElement = MediaElement & Partial<ElementEditState>;

/** Editor audio element */
export type EditorAudioElement = AudioElement & Partial<ElementEditState>;

/** Editor text element */
export type EditorTextElement = TextElement & Partial<ElementEditState>;

/** Editor shape element */
export type EditorShapeElement = ShapeElement & Partial<ElementEditState>;

/** Editor subtitle element */
export type EditorSubtitleElement = SubtitleElement & Partial<ElementEditState>;

// =============================================================================
// Extended Track Type (Engine fields + UI fields)
// =============================================================================

/**
 * Editor track — TimelineTrack with optional UI state fields.
 *
 * Used throughout the webview Store and components.
 * The UI fields (solo, color, height, etc.) are stored directly on the track
 * for convenience, but are NOT sent to the engine.
 */
export type EditorTrack = TimelineTrack & Partial<TrackUIState>;

// =============================================================================
// Utility: Strip UI fields for engine communication
// =============================================================================

/**
 * Pick only the specified keys from an object.
 * Used for whitelist-based engine field extraction.
 */
function pickKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

/**
 * Strip UI-only fields from an editor element, returning engine-compatible data.
 * Uses whitelist approach: only picks fields defined in the proto schema.
 */
export function toEngineElement(element: EditorElement): TimelineElement {
  const raw = element as unknown as Record<string, unknown>;
  const base = pickKeys(raw, ENGINE_BASE_ELEMENT_KEYS);

  const typeKeyMap: Record<string, readonly string[]> = {
    media: ENGINE_MEDIA_KEYS,
    audio: ENGINE_AUDIO_KEYS,
    text: ENGINE_TEXT_KEYS,
    shape: ENGINE_SHAPE_KEYS,
    subtitle: ENGINE_SUBTITLE_KEYS,
  };

  const typeKeys = typeKeyMap[element.type];
  const typeFields = typeKeys ? pickKeys(raw, typeKeys) : {};

  return { ...base, ...typeFields, type: element.type } as unknown as TimelineElement;
}

/**
 * Strip UI-only fields from an editor track, returning engine-compatible data.
 * Uses whitelist approach: only picks fields defined in the proto schema.
 */
export function toEngineTrack(track: EditorTrack): TimelineTrack {
  const raw = track as unknown as Record<string, unknown>;
  const base = pickKeys(raw, ENGINE_TRACK_KEYS);
  // Map 'trackType' → 'type' (proto uses trackType, TS uses type)
  if (!('type' in base) && 'trackType' in base) {
    base.type = base.trackType;
    delete base.trackType;
  }
  // Recursively convert elements
  if (Array.isArray(track.elements)) {
    base.elements = track.elements.map((el) => toEngineElement(el as EditorElement));
  }
  return base as unknown as TimelineTrack;
}

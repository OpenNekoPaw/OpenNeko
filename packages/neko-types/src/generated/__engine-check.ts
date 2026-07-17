// =============================================================================
// Compile-time Engine ↔ Hand-written Type Consistency Check
//
// This file is never imported at runtime. It exists solely so that `tsc`
// catches drift between generated Engine* types and hand-written types.
//
// If packages/neko-proto/timeline.proto adds a new field and you re-run the generator,
// but forget to update the hand-written type, `tsc --noEmit` will fail here.
// =============================================================================

import type { EngineElement } from './timeline.engine';
import type { EngineTransform } from './timeline.engine';
import type { EngineTrack } from './timeline.engine';
import type { EngineAudioProperties } from './timeline.engine';

// Re-import hand-written types
import type { Transform } from '../types/transform';
import type { AudioProperties } from '../types/audio';
import type { TimelineTrack } from '../types/timelineTrack';

// ---------------------------------------------------------------------------
// Helper: check that all keys of A exist in B
// ---------------------------------------------------------------------------
type AssertKeysSubset<A, B> =
  Exclude<keyof A, keyof B> extends never
    ? true
    : {
        error: 'Generated type has fields missing from hand-written type';
        fields: Exclude<keyof A, keyof B>;
      };

// ---------------------------------------------------------------------------
// EngineElement ↔ BaseTimelineElement
// (checked in element.ts directly since BaseTimelineElement is not exported)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// EngineTransform ↔ Transform
// ---------------------------------------------------------------------------
type _TransformDrift = AssertKeysSubset<EngineTransform, Transform>;
const _t: _TransformDrift = true;

// ---------------------------------------------------------------------------
// EngineAudioProperties ↔ AudioProperties
// ---------------------------------------------------------------------------
type _AudioDrift = AssertKeysSubset<EngineAudioProperties, AudioProperties>;
const _a: _AudioDrift = true;

// ---------------------------------------------------------------------------
// EngineTrack ↔ TimelineTrack
// Note: EngineTrack uses 'trackType' while TimelineTrack uses 'type'.
// This is a known mapping difference handled at the serialization boundary.
// We check all keys except 'trackType'.
// ---------------------------------------------------------------------------
type _TrackDrift = AssertKeysSubset<Omit<EngineTrack, 'trackType'>, TimelineTrack>;
const _tr: _TrackDrift = true;

// ---------------------------------------------------------------------------
// Diff types — verify all generated types are importable.
// Since diff types are consumed via re-export (no hand-written mapping),
// we validate re-export completeness rather than field-level drift.
// ---------------------------------------------------------------------------
import type {
  EngineDiffCategory,
  EngineDiffResult,
  EngineFieldDiff,
  EngineMediaInfo,
  EngineSubtitleStream,
  EngineImageContentDiff,
  EngineAudioContentDiff,
  EngineAudioDiffRegion,
  EngineVideoContentDiff,
  EngineVideoDiffRegion,
  EngineFrameMetric,
  EngineTimelineContentDiff,
  EngineTimelineChangeType,
  EngineTimelineDiffSummary,
  EngineTimelineProjectMeta,
  EngineTrackChange,
  EngineElementChange,
  EnginePropertyChange,
  EngineElementContentDiff,
} from './diff.engine';

// Tuple check: if any type above fails to resolve, tsc will error.
type _DiffTypeCheck = [
  EngineDiffCategory,
  EngineDiffResult,
  EngineFieldDiff,
  EngineMediaInfo,
  EngineSubtitleStream,
  EngineImageContentDiff,
  EngineAudioContentDiff,
  EngineAudioDiffRegion,
  EngineVideoContentDiff,
  EngineVideoDiffRegion,
  EngineFrameMetric,
  EngineTimelineContentDiff,
  EngineTimelineChangeType,
  EngineTimelineDiffSummary,
  EngineTimelineProjectMeta,
  EngineTrackChange,
  EngineElementChange,
  EnginePropertyChange,
  EngineElementContentDiff,
];

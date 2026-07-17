// =============================================================================
// Track Types — Aligned with Engine (types/common.rs → TrackType)
//
// Authority: packages/neko-proto/timeline.proto → TrackType
// Engine supports: Video, Audio, Text, Effect, Subtitle, Shape, Scene3d, Media
// 'media' is an alias for 'video' (used in JVI files).
// =============================================================================

export type TrackType =
  | 'video'
  | 'audio'
  | 'text'
  | 'effect'
  | 'subtitle'
  | 'shape'
  | 'scene3d'
  | 'puppet'
  | 'media';

/**
 * 媒体类型（用于素材分类）
 * Media type for asset classification
 */
export type MediaType = 'video' | 'audio' | 'image' | 'timeline';

// =============================================================================
// Scene Project Types — .nkm file format (v2)
//
// Lightweight JSON wrapper for 2D/3D Scene and Live Stage authoring.
// Existing 3D model projects continue to use model.src; profile selects the
// authoring surface while scene-specific fields stay optional and profile-owned.
// =============================================================================

import type { EasingType } from './easing';

export type NkmSceneProfile = '2d' | '3d' | 'live';
export type NkmVec2 = readonly [number, number];
export type NkmVec3 = readonly [number, number, number];

// ── Project Data (top-level .nkm file) ───────────────────────────────────────

/** .nkm project data — Scene authoring truth for 2D, 3D, and Live profiles. */
export interface NkmProjectData {
  /** Format version (current: 2) */
  version: number;
  /** Project display name */
  name: string;
  /**
   * Scene authoring profile.
   *
   * Missing profile is treated as "3d" for pre-profile .nkm files.
   */
  profile?: NkmSceneProfile;
  /** Source model reference */
  model: {
    /** Relative path to .gltf/.glb/.vrm file (null if no model linked) */
    src: string | null;
  };

  /** 2D Scene authoring state, only meaningful for profile: "2d". */
  scene2d?: NkmScene2DState;

  /** Live Stage authoring state, only meaningful for profile: "live". */
  live?: NkmLiveStageState;

  // ── Face Customization ──

  /** Face parameter morph weights (Blend Shape values, keyed by parameter ID) */
  faceParams: Record<string, number>;

  // ── Custom Animations ──

  /** Custom animation clips created in the editor (user keyframe data) */
  customClips: SerializedAnimationClip[];

  // ── Camera ──

  /** Saved camera state (null uses default orbit camera) */
  camera: CameraState | null;

  // ── Viewport ──

  /** Editor viewport settings */
  viewport: {
    /** Zoom level (1.0 = default) */
    zoom: number;
  };

  // ── Editor State (opaque, for UI restoration) ──

  /** Additional editor state (selected node, panel toggles, etc.) */
  editorState: Record<string, unknown>;
}

// ── Serialized Animation Clip ────────────────────────────────────────────────

/** A complete animation clip with all channels and keyframe data */
export interface SerializedAnimationClip {
  /** Clip display name */
  name: string;
  /** Total duration in seconds */
  duration: number;
  /** Animation channels (one per animated property per node) */
  channels: SerializedAnimationChannel[];
}

/** A single animation channel targeting one property of one node */
export interface SerializedAnimationChannel {
  /** Target scene node ID */
  targetNode: string;
  /** Animated property */
  property: 'translation' | 'rotation' | 'scale' | 'morph_weights';
  /** Keyframe data */
  keyframes: SerializedKeyframe[];
}

/** A single keyframe in a serialized channel */
export interface SerializedKeyframe {
  /** Unique keyframe ID (UUID v4) */
  id: string;
  /** Time in seconds */
  timestamp: number;
  /** Values array (3 for translation/scale, 4 for rotation, N for morph_weights) */
  values: number[];
  /** Easing function to next keyframe */
  easing: EasingType;
}

// ── Camera State ─────────────────────────────────────────────────────────────

/** Saved camera position and projection parameters */
export interface CameraState {
  /** Camera world position [x, y, z] */
  position: [number, number, number];
  /** Camera look-at target [x, y, z] */
  target: [number, number, number];
  /** Camera up vector [x, y, z] */
  up: [number, number, number];
  /** Vertical field of view in degrees */
  fov: number;
}

// ── 2D Scene Profile ─────────────────────────────────────────────────────────

export interface NkmScene2DState {
  readonly sprites?: readonly NkmScene2DSprite[];
  readonly tilemaps?: readonly NkmScene2DTilemap[];
  readonly lights?: readonly NkmScene2DLight[];
  readonly parallaxLayers?: readonly NkmScene2DParallaxLayer[];
  readonly particles?: readonly NkmScene2DParticleEmitter[];
  readonly camera?: NkmScene2DCamera | null;
}

export interface NkmScene2DNodeBase {
  readonly id: string;
  readonly name?: string;
  readonly position?: NkmVec2;
  readonly rotation?: number;
  readonly scale?: NkmVec2;
  readonly zOrder?: number;
}

export interface NkmScene2DSprite extends NkmScene2DNodeBase {
  readonly assetRef: string;
}

export interface NkmScene2DTilemap extends NkmScene2DNodeBase {
  readonly tilesetRef: string;
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface NkmScene2DLight extends NkmScene2DNodeBase {
  readonly kind: 'point' | 'directional' | 'ambient';
  readonly color?: string;
  readonly intensity?: number;
  readonly radius?: number;
}

export interface NkmScene2DParallaxLayer extends NkmScene2DNodeBase {
  readonly assetRef: string;
  readonly speed: NkmVec2;
}

export interface NkmScene2DParticleEmitter extends NkmScene2DNodeBase {
  readonly preset?: string;
  readonly rate?: number;
}

export interface NkmScene2DCamera {
  readonly position: NkmVec2;
  readonly zoom: number;
  readonly rotation?: number;
}

// ── Live Stage Profile ───────────────────────────────────────────────────────

export interface NkmLiveStageState {
  readonly actors?: readonly NkmLiveActorRef[];
  readonly routes?: readonly NkmLiveRoute[];
}

export interface NkmLiveActorRef {
  readonly id: string;
  readonly ref: string;
  readonly role?: string;
}

export interface NkmLiveRoute {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/** Current .nkm format version */
export const NKM_VERSION = 2;

/** Create a default empty .nkm project data */
export function createDefaultNkmProject(
  name: string,
  modelSrc: string | null = null,
  profile: NkmSceneProfile = '3d',
): NkmProjectData {
  return {
    version: NKM_VERSION,
    name,
    profile,
    model: { src: modelSrc },
    faceParams: {},
    customClips: [],
    camera: null,
    viewport: { zoom: 1.0 },
    editorState: {},
  };
}

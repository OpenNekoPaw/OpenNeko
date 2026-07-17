/**
 * JVI Project Loader
 *
 * Loads and parses .nkv project files for export.
 * This is a core neko-cut functionality, independent of neko-engine.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveWorkspaceMediaPath, type WorkspaceMediaPathContext } from '@neko/shared';

// =============================================================================
// Track Layer Types (for export)
// =============================================================================

export interface TrackLayer {
  /** Unique layer ID */
  id: string;
  /** Layer type */
  type: 'video' | 'image' | 'text' | 'shape' | 'effect';
  /** Start time in seconds (relative to timeline) */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Layer source (file path for video/image, content for text) */
  source?: string;
  /** Layer width (for non-video sources) */
  width?: number;
  /** Layer height (for non-video sources) */
  height?: number;
  /** Z-index (layer order) */
  zIndex: number;
  /** Blend mode */
  blendMode?: string;
  /** Initial opacity */
  opacity?: number;
  /** Transform */
  transform?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorX: number;
    anchorY: number;
  };
  /** Animations */
  animations?: Array<{
    property: string;
    keyframes: Array<{
      time: number;
      value: { valueType: string; number?: number; x?: number; y?: number };
      easing?: string;
    }>;
  }>;
}

// =============================================================================
// JVI Project Types
// =============================================================================

export interface JviProject {
  version: string;
  name: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  tracks: JviTrack[];
  defaults?: {
    text?: TextDefaults;
    transform?: TransformDefaults;
    audio?: AudioDefaults;
  };
}

export interface JviTrack {
  id: string;
  name: string;
  type: 'media' | 'audio' | 'subtitle' | 'text' | 'shape';
  elements: JviElement[];
  muted: boolean;
  isMain?: boolean;
}

export interface JviElement {
  id: string;
  type: 'media' | 'audio' | 'text' | 'shape' | 'subtitle';
  name?: string;
  src?: string;
  duration: number;
  startTime: number;
  trimStart?: number;
  trimEnd?: number;
  // Transform properties
  transform?: {
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    opacity?: number;
  };
  // Text properties
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  // Animations
  animations?: Array<{
    property: string;
    keyframes: Array<{
      time: number;
      value: number | { x: number; y: number };
      easing?: string;
    }>;
  }>;
}

interface TextDefaults {
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  textAlign: string;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
}

interface TransformDefaults {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

interface AudioDefaults {
  volume: number;
  pan: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
}

// =============================================================================
// JVI Project Loader
// =============================================================================

export class JviProjectLoader {
  private _projectPath: string;
  private _projectDir: string;
  private _workspaceContext: WorkspaceMediaPathContext;
  private _project: JviProject | null = null;

  constructor(projectPath: string, workspaceContext?: WorkspaceMediaPathContext) {
    this._projectPath = projectPath;
    this._projectDir = path.dirname(projectPath);
    this._workspaceContext = workspaceContext ?? {
      documentDir: this._projectDir,
      workspaceRoots: [],
      allowedRoots: [this._projectDir],
    };
  }

  /**
   * Load and parse the JVI project file
   */
  async load(): Promise<JviProject> {
    const content = await fs.promises.readFile(this._projectPath, 'utf-8');
    this._project = JSON.parse(content) as JviProject;
    return this._project;
  }

  /**
   * Get the loaded project
   */
  get project(): JviProject | null {
    return this._project;
  }

  /**
   * Get the project directory
   */
  get projectDir(): string {
    return this._projectDir;
  }

  /**
   * Resolve a relative path to absolute
   */
  resolvePath(relativePath: string): string {
    const resolved = resolveWorkspaceMediaPath({
      source: relativePath,
      context: this._workspaceContext,
      fileExists: (filePath) => {
        try {
          return fs.statSync(filePath).isFile();
        } catch {
          return false;
        }
      },
    });
    if (resolved.status === 'resolved-local') return resolved.path;
    if (resolved.status === 'remote') return resolved.url;
    if (path.isAbsolute(relativePath)) return relativePath;
    return path.join(this._projectDir, relativePath);
  }

  /**
   * Convert JVI elements to TrackLayers for export
   */
  toTrackLayers(): TrackLayer[] {
    if (!this._project) {
      throw new Error('Project not loaded');
    }

    const layers: TrackLayer[] = [];
    let zIndex = 0;

    for (const track of this._project.tracks) {
      // Skip muted tracks
      if (track.muted) continue;

      for (const element of track.elements) {
        const layer = this.elementToTrackLayer(element, track, zIndex++);
        if (layer) {
          layers.push(layer);
        }
      }
    }

    return layers;
  }

  /**
   * Convert a JVI element to a TrackLayer
   */
  private elementToTrackLayer(
    element: JviElement,
    track: JviTrack,
    zIndex: number,
  ): TrackLayer | null {
    const layerType = this.mapElementType(element.type, track.type);
    if (!layerType) return null;

    const defaults = this._project?.defaults?.transform;

    // Calculate effective start time considering trim
    const effectiveStartTime = element.startTime;
    const effectiveDuration = element.duration - (element.trimStart ?? 0) - (element.trimEnd ?? 0);

    const layer: TrackLayer = {
      id: element.id,
      type: layerType,
      startTime: effectiveStartTime,
      duration: effectiveDuration,
      zIndex,
      opacity: element.transform?.opacity ?? defaults?.opacity ?? 1.0,
    };

    // Add source for media elements
    if (element.src) {
      layer.source = this.resolvePath(element.src);
    }

    // Add transform
    if (element.transform || defaults) {
      layer.transform = {
        x: (element.transform?.x ?? defaults?.x ?? 0.5) * (this._project?.resolution.width ?? 1920),
        y:
          (element.transform?.y ?? defaults?.y ?? 0.5) * (this._project?.resolution.height ?? 1080),
        scaleX: element.transform?.scaleX ?? defaults?.scaleX ?? 1,
        scaleY: element.transform?.scaleY ?? defaults?.scaleY ?? 1,
        rotation: element.transform?.rotation ?? defaults?.rotation ?? 0,
        anchorX: 0.5,
        anchorY: 0.5,
      };
    }

    // Add animations
    if (element.animations && element.animations.length > 0) {
      layer.animations = element.animations.map((anim) => ({
        property: anim.property,
        keyframes: anim.keyframes.map((kf) => ({
          time: kf.time,
          value: this.convertKeyframeValue(kf.value),
          easing: kf.easing,
        })),
      }));
    }

    return layer;
  }

  /**
   * Map element type to track layer type
   */
  private mapElementType(
    elementType: string,
    trackType: string,
  ): 'video' | 'image' | 'text' | 'shape' | 'effect' | null {
    if (elementType === 'media') {
      // Check if it's an image or video based on extension
      return 'video'; // Default to video, will be determined by source
    }
    if (elementType === 'text' || trackType === 'text') {
      return 'text';
    }
    if (elementType === 'shape' || trackType === 'shape') {
      return 'shape';
    }
    if (elementType === 'audio' || trackType === 'audio') {
      return null; // Audio handled separately
    }
    return null;
  }

  /**
   * Convert keyframe value to AnimatableValueInput format
   */
  private convertKeyframeValue(value: number | { x: number; y: number }): {
    valueType: string;
    number?: number;
    x?: number;
    y?: number;
  } {
    if (typeof value === 'number') {
      return { valueType: 'Number', number: value };
    }
    return { valueType: 'Point2D', x: value.x, y: value.y };
  }

  /**
   * Get project duration (max end time of all elements)
   */
  getProjectDuration(): number {
    if (!this._project) return 0;

    let maxEndTime = 0;
    for (const track of this._project.tracks) {
      for (const element of track.elements) {
        const endTime = element.startTime + element.duration;
        if (endTime > maxEndTime) {
          maxEndTime = endTime;
        }
      }
    }
    return maxEndTime;
  }
}

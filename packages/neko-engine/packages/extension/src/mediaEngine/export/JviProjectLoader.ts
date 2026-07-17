/**
 * JVI Project Loader
 *
 * Loads and parses .nkv project files for export.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TrackLayer } from './ExportService';

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
  private _project: JviProject | null = null;

  constructor(projectPath: string) {
    this._projectPath = projectPath;
    this._projectDir = path.dirname(projectPath);
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
    if (path.isAbsolute(relativePath)) {
      return relativePath;
    }
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
   * Backward-compatible alias used by the extension entrypoint.
   */
  toLayers(): TrackLayer[] {
    return this.toTrackLayers();
  }

  /**
   * Convert a JVI element to a TrackLayer
   */
  private elementToTrackLayer(
    element: JviElement,
    track: JviTrack,
    zIndex: number,
  ): TrackLayer | null {
    const layerType = this.mapElementType(element, track.type);
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
  private static readonly IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
  ]);

  private mapElementType(
    element: JviElement,
    trackType: string,
  ): 'video' | 'image' | 'text' | 'shape' | 'effect' | null {
    if (element.type === 'media') {
      if (element.src) {
        const ext = element.src.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (ext && JviProjectLoader.IMAGE_EXTENSIONS.has(ext)) {
          return 'image';
        }
      }
      return 'video';
    }
    if (element.type === 'text' || trackType === 'text') {
      return 'text';
    }
    if (element.type === 'shape' || trackType === 'shape') {
      return 'shape';
    }
    if (element.type === 'audio' || trackType === 'audio') {
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

  /**
   * Backward-compatible alias used by the export command.
   */
  calculateDuration(): number {
    return this.getProjectDuration();
  }

  /**
   * Get audio sources from the project for export
   */
  getAudioSources(): Array<{
    path: string;
    startTime: number;
    duration: number;
    trimStart: number;
    volume: number;
  }> {
    if (!this._project) return [];

    const audioSources: Array<{
      path: string;
      startTime: number;
      duration: number;
      trimStart: number;
      volume: number;
    }> = [];

    for (const track of this._project.tracks) {
      // Skip muted tracks
      if (track.muted) continue;

      // Only process audio tracks
      if (track.type !== 'audio') continue;

      for (const element of track.elements) {
        if (!element.src) continue;

        const effectiveDuration =
          element.duration - (element.trimStart ?? 0) - (element.trimEnd ?? 0);

        // Get volume from audio settings or default to 1
        let volume = 1;
        if ('audio' in element && element.audio) {
          const audioSettings = element.audio as {
            volume?: { baseValue?: number };
            muted?: boolean;
          };
          if (audioSettings.muted) continue; // Skip muted elements
          volume = audioSettings.volume?.baseValue ?? 1;
        }

        audioSources.push({
          path: this.resolvePath(element.src),
          startTime: element.startTime,
          duration: effectiveDuration,
          trimStart: element.trimStart ?? 0,
          volume,
        });
      }
    }

    return audioSources;
  }
}

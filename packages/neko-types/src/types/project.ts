// =============================================================================
// Project Data (.nkv file format)
// =============================================================================

import { TimelineTrack } from './timelineTrack';
import { TimelineElement } from './element';
import { TrackType } from './track';

// =============================================================================
// Project Defaults (Global default values for new elements)
//
// Engine fields aligned with EngineProjectDefaults (from proto).
// UI-only extensions are marked with @ui-only.
// =============================================================================

export interface ProjectDefaults {
  // Text element defaults (engine: fontSize, fontFamily, color)
  text: {
    fontSize: number;
    fontFamily: string;
    color: string;
    /** @ui-only Not in engine ProjectDefaults */
    backgroundColor: string;
    /** @ui-only Not in engine ProjectDefaults */
    textAlign: 'left' | 'center' | 'right';
    /** @ui-only Not in engine ProjectDefaults */
    fontWeight: 'normal' | 'bold';
    /** @ui-only Not in engine ProjectDefaults */
    fontStyle: 'normal' | 'italic';
    /** @ui-only Not in engine ProjectDefaults */
    textDecoration: 'none' | 'underline' | 'line-through';
  };
  // Transform defaults (engine: x, y, scaleX, scaleY, rotation)
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    /** @ui-only Not in engine ProjectDefaults — opacity is on Element, not Transform */
    opacity: number;
  };
  // Audio defaults (engine: volume, pan, fadeIn, fadeOut)
  audio: {
    volume: number;
    pan: number;
    fadeIn: number;
    fadeOut: number;
    /** @ui-only Not in engine ProjectDefaults */
    gain: number;
  };
}

export interface ProjectData {
  version: string;
  name: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  tracks: TimelineTrack[];
  defaults?: ProjectDefaults;
}

// =============================================================================
// Helper Functions
// =============================================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create default project defaults (global settings)
 */
export function createDefaultProjectDefaults(): ProjectDefaults {
  return {
    text: {
      fontSize: 48,
      fontFamily: 'Arial',
      color: '#ffffff',
      backgroundColor: 'transparent',
      textAlign: 'center',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
    },
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    },
    audio: {
      volume: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0,
      gain: 0,
    },
  };
}

export function createDefaultProject(name: string = 'Untitled Project'): ProjectData {
  return {
    version: '2.0',
    name,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: generateId(),
        name: 'Main Track',
        type: 'media',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    defaults: createDefaultProjectDefaults(),
  };
}

import { TextElement } from './element';
import { ENGINE_DEFAULT_TRANSFORM } from './transform';

export function createDefaultTextElement(startTime: number = 0): TextElement {
  return {
    id: generateId(),
    type: 'text',
    name: 'New Text',
    content: 'Enter text here',
    duration: 5,
    startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: { ...ENGINE_DEFAULT_TRANSFORM },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    fontSize: 48,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: 'transparent',
    textAlign: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
  };
}

/**
 * Sort tracks by type: text on top, shape, media in middle, audio/subtitle at bottom
 */
export function sortTracksByType(tracks: TimelineTrack[]): TimelineTrack[] {
  return [...tracks].sort((a, b) => {
    const order: Record<TrackType, number> = {
      text: 0,
      shape: 1,
      video: 2,
      media: 2,
      effect: 3,
      audio: 4,
      subtitle: 5,
    };
    return order[a.type] - order[b.type];
  });
}

/**
 * Calculate the effective duration of an element (after trim)
 */
export function getEffectiveDuration(element: TimelineElement): number {
  return element.duration - element.trimStart - element.trimEnd;
}

/**
 * Calculate the end time of an element on the timeline
 */
export function getElementEndTime(element: TimelineElement): number {
  return element.startTime + getEffectiveDuration(element);
}

/**
 * Get the total duration of all tracks
 */
export function getTotalDuration(tracks: TimelineTrack[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const element of track.elements) {
      const endTime = getElementEndTime(element);
      if (endTime > maxEnd) {
        maxEnd = endTime;
      }
    }
  }
  return maxEnd;
}

/**
 * Extract all media file paths from project data
 * Only extracts paths from media and audio elements (files that need codec analysis)
 */
export function extractMediaPaths(project: ProjectData): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const track of project.tracks) {
    for (const element of track.elements) {
      if (element.type === 'media' || element.type === 'audio') {
        const src = element.src;
        if (src && !seen.has(src)) {
          seen.add(src);
          paths.push(src);
        }
      }
    }
  }

  return paths;
}

/**
 * Handler for track, audio, color correction, and playback speed operations:
 * AddTrack, DeleteTrack, ReorderTracks, SetTrackProperties,
 * SetColorCorrection, ResetColorCorrection,
 * SeparateAudio, SetAudioProperties, SetPlaybackSpeed.
 */

import type { ProjectData, TimelineTrack } from '@neko/shared';
import { DEFAULT_AUDIO_PROPERTIES, DEFAULT_COLOR_CORRECTION, generateId } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import { findElement, updateElementAt, mergeElement, createElement } from './helpers';

export class TrackAudioHandler implements IToolHandler {
  readonly toolNames = [
    'AddTrack',
    'DeleteTrack',
    'ReorderTracks',
    'SetTrackProperties',
    'SetColorCorrection',
    'ResetColorCorrection',
    'SeparateAudio',
    'SetAudioProperties',
    'SetPlaybackSpeed',
  ] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'AddTrack':
        return this.addTrack(project, params);
      case 'DeleteTrack':
        return this.deleteTrack(project, params);
      case 'ReorderTracks':
        return this.reorderTracks(project, params);
      case 'SetTrackProperties':
        return this.setTrackProperties(project, params);
      case 'SetColorCorrection':
        return this.setColorCorrection(project, params);
      case 'ResetColorCorrection':
        return this.resetColorCorrection(project, params);
      case 'SeparateAudio':
        return this.separateAudio(project, params);
      case 'SetAudioProperties':
        return this.setAudioProperties(project, params);
      case 'SetPlaybackSpeed':
        return this.setPlaybackSpeed(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private addTrack(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { name, type } = params as { name?: string; type?: string };
    if (!name || !type) return { success: false, error: 'name and type are required' };

    const normalizedType = type === 'video' ? 'media' : type;
    const validTypes = ['media', 'audio', 'subtitle', 'shape', 'text'];
    if (!validTypes.includes(normalizedType)) {
      return {
        success: false,
        error: `Invalid track type: ${type}. Valid types: ${validTypes.join(', ')}`,
      };
    }

    const trackId = `track-${generateId()}`;
    const newTrack: TimelineTrack = {
      id: trackId,
      name,
      type: normalizedType as TimelineTrack['type'],
      elements: [],
      locked: false,
      muted: false,
      hidden: false,
      isMain: false,
    };

    return {
      success: true,
      data: { trackId, message: 'Track created successfully' },
      updatedProject: { ...project, tracks: [...project.tracks, newTrack] },
    };
  }

  private deleteTrack(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const trackId = params.trackId as string | undefined;
    if (!trackId) return { success: false, error: 'trackId is required' };

    const idx = project.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return { success: false, error: `Track not found: ${trackId}` };

    const updatedTracks = [...project.tracks];
    updatedTracks.splice(idx, 1);
    return {
      success: true,
      data: { message: 'Track deleted successfully' },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }

  private reorderTracks(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const trackIds = params.trackIds as string[] | undefined;
    if (!trackIds || !Array.isArray(trackIds))
      return { success: false, error: 'trackIds array is required' };

    const existingIds = new Set(project.tracks.map((t) => t.id));
    for (const id of trackIds) {
      if (!existingIds.has(id)) return { success: false, error: `Track not found: ${id}` };
    }
    if (trackIds.length !== project.tracks.length) {
      return { success: false, error: 'trackIds must include all existing tracks' };
    }

    const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
    const reorderedTracks = trackIds.map((id) => trackMap.get(id)!);
    return {
      success: true,
      data: { message: 'Tracks reordered successfully' },
      updatedProject: { ...project, tracks: reorderedTracks },
    };
  }

  private setTrackProperties(
    project: ProjectData,
    params: Record<string, unknown>,
  ): ToolApplyResult {
    const { trackId, name, locked, muted } = params as {
      trackId?: string;
      name?: string;
      locked?: boolean;
      muted?: boolean;
    };
    if (!trackId) return { success: false, error: 'trackId is required' };

    const idx = project.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return { success: false, error: `Track not found: ${trackId}` };

    const baseTrack = project.tracks[idx]!;
    const updatedTrack: TimelineTrack = { ...baseTrack };
    if (name !== undefined) updatedTrack.name = name;
    if (locked !== undefined) updatedTrack.locked = locked;
    if (muted !== undefined) updatedTrack.muted = muted;

    const updatedTracks = [...project.tracks];
    updatedTracks[idx] = updatedTrack;

    return {
      success: true,
      data: { trackId, message: 'Track properties updated successfully' },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }

  private setColorCorrection(
    project: ProjectData,
    params: Record<string, unknown>,
  ): ToolApplyResult {
    const elementId = params.elementId as string | undefined;
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    // Accept direct adjustment fields and the grouped payload produced by
    // TimelineToolBridge when expanding public element updates.
    const nested = (params as { colorCorrection?: unknown }).colorCorrection as
      | Record<string, unknown>
      | undefined;
    const ccParams = nested ?? (params as Record<string, unknown>);

    const existingCC =
      (found.element.colorCorrection as Record<string, unknown> | undefined) ??
      DEFAULT_COLOR_CORRECTION;

    const existingBasic =
      ((existingCC as Record<string, unknown>).basic as Record<string, unknown> | undefined) ?? {};

    const updatedCC = {
      ...existingCC,
      enabled: true,
      basic: {
        ...existingBasic,
        ...(ccParams.brightness !== undefined && { brightness: ccParams.brightness }),
        ...(ccParams.contrast !== undefined && { contrast: ccParams.contrast }),
        ...(ccParams.saturation !== undefined && { saturation: ccParams.saturation }),
        ...(ccParams.temperature !== undefined && { temperature: ccParams.temperature }),
        ...(ccParams.tint !== undefined && { tint: ccParams.tint }),
        ...(ccParams.exposure !== undefined && { exposure: ccParams.exposure }),
        ...(ccParams.gamma !== undefined && { gamma: ccParams.gamma }),
        ...(ccParams.shadows !== undefined && { shadows: ccParams.shadows }),
        ...(ccParams.highlights !== undefined && { highlights: ccParams.highlights }),
      },
    };

    const updatedElement = mergeElement(found.element, { colorCorrection: updatedCC });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { elementId, message: 'Color correction applied successfully' },
      updatedProject,
    };
  }

  private resetColorCorrection(
    project: ProjectData,
    params: Record<string, unknown>,
  ): ToolApplyResult {
    const elementId = params.elementId as string | undefined;
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const updatedElement = mergeElement(found.element, {
      colorCorrection: DEFAULT_COLOR_CORRECTION,
    });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { elementId, message: 'Color correction reset to defaults' },
      updatedProject,
    };
  }

  private separateAudio(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, targetTrackId } = params as { elementId?: string; targetTrackId?: string };
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };
    if (found.element.type !== 'media')
      return { success: false, error: 'Audio can only be separated from media elements' };

    // TS narrows to MediaElement after type check
    const mediaElement = found.element;
    if (mediaElement.linkedAudioId)
      return { success: false, error: 'Audio has already been separated from this element' };

    // Find or create target audio track
    let audioTrackId = targetTrackId;
    let createdNewTrack = false;

    if (!audioTrackId) {
      const existingAudioTrack = project.tracks.find((t) => t.type === 'audio');
      if (existingAudioTrack) {
        audioTrackId = existingAudioTrack.id;
      } else {
        audioTrackId = `track-${generateId()}`;
        createdNewTrack = true;
      }
    }

    const targetTrackIndex = project.tracks.findIndex((t) => t.id === audioTrackId);
    if (targetTrackIndex === -1 && !createdNewTrack) {
      return { success: false, error: `Target track not found: ${audioTrackId}` };
    }

    const audioElementId = generateId();
    const audioElement = createElement({
      id: audioElementId,
      type: 'audio',
      name: `${found.element.name} (Audio)`,
      src: mediaElement.src,
      startTime: found.element.startTime,
      duration: found.element.duration,
      trimStart: found.element.trimStart,
      trimEnd: found.element.trimEnd,
      audio: found.element.audio ?? { ...DEFAULT_AUDIO_PROPERTIES },
    });

    const updatedVideoElement = mergeElement(found.element, {
      muted: true,
      linkedAudioId: audioElementId,
    });

    let updatedTracks = project.tracks.map((t) => t);

    // If creating a new audio track
    if (createdNewTrack) {
      const newTrack: TimelineTrack = {
        id: audioTrackId!,
        name: 'Audio',
        type: 'audio',
        elements: [audioElement],
        locked: false,
        muted: false,
        hidden: false,
        isMain: false,
      };
      updatedTracks = [...updatedTracks, newTrack];
    } else {
      // Append audio element to existing track
      const targetTrack = updatedTracks[targetTrackIndex]!;
      if (targetTrack.type !== 'audio')
        return { success: false, error: 'Target track must be an audio track' };
      updatedTracks[targetTrackIndex] = {
        ...targetTrack,
        elements: [...targetTrack.elements, audioElement],
      };
    }

    // Update video element in its original track
    const originalTrack = updatedTracks[found.trackIndex]!;
    const updatedElements = [...originalTrack.elements];
    updatedElements[found.elementIndex] = updatedVideoElement;
    updatedTracks[found.trackIndex] = { ...originalTrack, elements: updatedElements };

    return {
      success: true,
      data: {
        videoElementId: elementId,
        audioElementId,
        audioTrackId,
        createdNewTrack,
        message: 'Audio separated successfully',
      },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }

  private setAudioProperties(
    project: ProjectData,
    params: Record<string, unknown>,
  ): ToolApplyResult {
    const { elementId, volume, pan, muted, fadeIn, fadeOut } = params as {
      elementId?: string;
      volume?: number;
      pan?: number;
      muted?: boolean;
      fadeIn?: number;
      fadeOut?: number;
    };
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const existingAudio = (found.element.audio as Record<string, unknown> | undefined) ?? {
      ...DEFAULT_AUDIO_PROPERTIES,
    };

    const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

    const updatedAudio = {
      ...existingAudio,
      ...(volume !== undefined && { volume: clamp(volume, 0, 200) }),
      ...(pan !== undefined && { pan: clamp(pan, -100, 100) }),
      ...(muted !== undefined && { muted }),
      ...(fadeIn !== undefined && { fadeIn: Math.max(0, fadeIn) }),
      ...(fadeOut !== undefined && { fadeOut: Math.max(0, fadeOut) }),
    };

    const updatedElement = mergeElement(found.element, { audio: updatedAudio });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { elementId, message: 'Audio properties updated successfully' },
      updatedProject,
    };
  }

  private setPlaybackSpeed(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, speed, maintainPitch } = params as {
      elementId?: string;
      speed?: number;
      maintainPitch?: boolean;
    };
    if (!elementId) return { success: false, error: 'elementId is required' };
    if (speed === undefined || speed <= 0)
      return { success: false, error: 'speed must be a positive number' };
    if (speed < 0.25 || speed > 4.0)
      return { success: false, error: 'speed must be between 0.25 and 4.0' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };
    if (found.element.type !== 'media' && found.element.type !== 'audio') {
      return { success: false, error: 'Speed can only be set on media or audio elements' };
    }

    const updatedElement = mergeElement(found.element, {
      speed: {
        speed,
        preservePitch: maintainPitch ?? true,
        reverse: false,
      },
    });

    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: {
        elementId,
        speed,
        maintainPitch: maintainPitch ?? true,
        message: 'Playback speed set successfully',
      },
      updatedProject,
    };
  }
}

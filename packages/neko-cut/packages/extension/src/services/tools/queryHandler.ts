/**
 * Handler for read-only timeline queries: GetTimelineInfo, GetElementInfo, ListElements.
 */

import type { ProjectData } from '@neko/shared';
import { getTotalDuration } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import type { ToolElement } from './helpers';

export class QueryHandler implements IToolHandler {
  readonly toolNames = ['GetTimelineInfo', 'GetElementInfo', 'ListElements'] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'GetTimelineInfo':
        return this.getTimelineInfo(project);
      case 'GetElementInfo':
        return this.getElementInfo(project, params);
      case 'ListElements':
        return this.listElements(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private getTimelineInfo(project: ProjectData): ToolApplyResult {
    const tracks = project.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      elementCount: track.elements.length,
      locked: track.locked,
      muted: track.muted,
    }));

    return {
      success: true,
      data: {
        duration: getTotalDuration(project.tracks),
        fps: project.fps,
        width: project.resolution.width,
        height: project.resolution.height,
        trackCount: project.tracks.length,
        tracks,
      },
    };
  }

  private getElementInfo(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const elementId = params.elementId as string | undefined;
    if (!elementId) return { success: false, error: 'elementId is required' };

    for (const track of project.tracks) {
      const element = track.elements.find((e) => e.id === elementId) as ToolElement | undefined;
      if (!element) continue;

      const info: Record<string, unknown> = {
        id: element.id,
        type: element.type,
        name: element.name,
        trackId: track.id,
        trackName: track.name,
        startTime: element.startTime,
        duration: element.duration,
        trimStart: element.trimStart,
        trimEnd: element.trimEnd,
        effectiveDuration: element.duration - element.trimStart - element.trimEnd,
        transform: element.transform,
      };

      // Use discriminated union narrowing for type-specific fields
      if (element.type === 'media' || element.type === 'audio') {
        info.src = element.src;
        if (element.audio) info.audio = element.audio;
        if (element.speed) info.speed = element.speed;
        info.muted = element.muted;
      }

      if (element.type === 'text') {
        info.content = element.content;
        info.fontSize = element.fontSize;
        info.fontFamily = element.fontFamily;
        info.color = element.color;
        info.textAlign = element.textAlign;
      }

      if (element.type === 'shape') {
        info.shapeType = element.shapeType;
      }

      // UI extension fields (available via ToolElement)
      if (element.effects.length > 0) info.effects = element.effects;
      if (element.transitionIn) info.transitionIn = element.transitionIn;
      if (element.transitionOut) info.transitionOut = element.transitionOut;
      if (element.animTransform) info.animTransform = element.animTransform;

      return { success: true, data: info };
    }

    return { success: false, error: `Element not found: ${elementId}` };
  }

  private listElements(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const trackId = params.trackId as string | undefined;
    const typeFilter = params.type as string | undefined;

    let tracksToSearch = project.tracks;
    if (trackId) {
      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return { success: false, error: `Track not found: ${trackId}` };
      tracksToSearch = [track];
    }

    const elements: Array<Record<string, unknown>> = [];
    for (const track of tracksToSearch) {
      for (const element of track.elements) {
        if (typeFilter && element.type !== typeFilter) continue;

        const info: Record<string, unknown> = {
          id: element.id,
          type: element.type,
          name: element.name,
          trackId: track.id,
          trackName: track.name,
          startTime: element.startTime,
          duration: element.duration,
          effectiveDuration: element.duration - element.trimStart - element.trimEnd,
        };

        // Use discriminated union narrowing
        if (element.type === 'media' || element.type === 'audio') {
          info.src = element.src;
        }
        if (element.type === 'text') {
          info.content = element.content;
        }

        elements.push(info);
      }
    }

    return { success: true, data: { count: elements.length, elements } };
  }
}

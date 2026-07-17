/**
 * Handler for keyframe operations:
 * GetKeyframes, AddKeyframe, UpdateKeyframe, RemoveKeyframe.
 */

import {
  applyOperation,
  createMeta,
  generateId,
  type EasingType,
  type Keyframe,
  type ProjectData,
} from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import { findElement, type ToolElement } from './helpers';

type AnimatablePropertyTrack = {
  readonly baseValue: number;
  readonly keyframes: readonly Keyframe[];
};

type TransformKeyframeRoot = Record<string, AnimatablePropertyTrack>;

export class KeyframeHandler implements IToolHandler {
  readonly toolNames = ['GetKeyframes', 'AddKeyframe', 'UpdateKeyframe', 'RemoveKeyframe'] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'GetKeyframes':
        return this.getKeyframes(project, params);
      case 'AddKeyframe':
        return this.addKeyframe(project, params);
      case 'UpdateKeyframe':
        return this.updateKeyframe(project, params);
      case 'RemoveKeyframe':
        return this.removeKeyframe(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private getKeyframes(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, property } = params as { elementId?: string; property?: string };
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const keyframes = getTransformKeyframes(found.element);
    const result = property ? { [property]: keyframes[property] || [] } : keyframes;

    return { success: true, data: { elementId, keyframes: result } };
  }

  private addKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, property, time, value, easing } = params as {
      elementId?: string;
      property?: string;
      time?: number;
      value?: unknown;
      easing?: string;
    };

    if (!elementId || !property || time === undefined || value === undefined) {
      return { success: false, error: 'elementId, property, time, and value are required' };
    }
    if (!isFiniteNumber(value)) {
      return { success: false, error: 'value must be a finite number' };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const canonicalProperty = normalizeTransformProperty(property);
    const keyframeId = `kf-${generateId()}`;
    const keyframe: Keyframe = {
      id: keyframeId,
      time,
      value,
      easing: readEasing(easing),
    };

    const updatedProject = applyOperation(project, {
      type: 'keyframe.add',
      meta: createMeta('ai', `Add ${canonicalProperty} keyframe`),
      payload: {
        trackId: found.track.id,
        elementId,
        target: { kind: 'transform', property: canonicalProperty },
        keyframe,
      },
    });

    return {
      success: true,
      data: { keyframeId, message: 'Keyframe added successfully' },
      updatedProject,
    };
  }

  private updateKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, keyframeId, time, value, easing } = params as {
      elementId?: string;
      keyframeId?: string;
      time?: number;
      value?: unknown;
      easing?: string;
    };

    if (!elementId || !keyframeId)
      return { success: false, error: 'elementId and keyframeId are required' };
    if (value !== undefined && !isFiniteNumber(value)) {
      return { success: false, error: 'value must be a finite number' };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const match = findTransformKeyframe(found.element, keyframeId);
    if (!match) return { success: false, error: `Keyframe not found: ${keyframeId}` };

    const updates: Partial<Keyframe> = {};
    if (time !== undefined) updates.time = time;
    if (value !== undefined) updates.value = value;
    if (easing !== undefined) updates.easing = readEasing(easing);

    const updatedProject = applyOperation(project, {
      type: 'keyframe.update',
      meta: createMeta('ai', `Update ${match.property} keyframe`),
      payload: {
        trackId: found.track.id,
        elementId,
        target: { kind: 'transform', property: match.property },
        keyframeId,
        keyframeTime: match.keyframe.time,
        updates,
      },
      before: {
        updates: {
          ...(time !== undefined ? { time: match.keyframe.time } : {}),
          ...(value !== undefined ? { value: match.keyframe.value } : {}),
          ...(easing !== undefined ? { easing: match.keyframe.easing } : {}),
        },
      },
    });
    return {
      success: true,
      data: { keyframeId, message: 'Keyframe updated successfully' },
      updatedProject,
    };
  }

  private removeKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, keyframeId } = params as { elementId?: string; keyframeId?: string };
    if (!elementId || !keyframeId)
      return { success: false, error: 'elementId and keyframeId are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const match = findTransformKeyframe(found.element, keyframeId);
    if (!match) return { success: false, error: `Keyframe not found: ${keyframeId}` };

    const updatedProject = applyOperation(project, {
      type: 'keyframe.remove',
      meta: createMeta('ai', `Remove ${match.property} keyframe`),
      payload: {
        trackId: found.track.id,
        elementId,
        target: { kind: 'transform', property: match.property },
        keyframeId,
        keyframeTime: match.keyframe.time,
      },
      before: {
        keyframe: match.keyframe,
        index: match.index,
      },
    });
    return { success: true, data: { message: 'Keyframe removed successfully' }, updatedProject };
  }
}

function normalizeTransformProperty(property: string): string {
  return property.startsWith('transform.') ? property : `transform.${property}`;
}

function getTransformKeyframes(element: ToolElement): Record<string, readonly Keyframe[]> {
  const root = readAnimRoot(element, 'animTransform');
  const result: Record<string, readonly Keyframe[]> = {};
  for (const [property, track] of Object.entries(root)) {
    result[property] = track.keyframes;
    result[`transform.${property}`] = track.keyframes;
  }
  return result;
}

function findTransformKeyframe(
  element: ToolElement,
  keyframeId: string,
): { readonly property: string; readonly keyframe: Keyframe; readonly index: number } | undefined {
  const root = readAnimRoot(element, 'animTransform');
  for (const [property, track] of Object.entries(root)) {
    const index = track.keyframes.findIndex((keyframe) => keyframe.id === keyframeId);
    const keyframe = track.keyframes[index];
    if (keyframe) {
      return { property: `transform.${property}`, keyframe, index };
    }
  }
  return undefined;
}

function readAnimRoot(element: ToolElement, key: string): TransformKeyframeRoot {
  const value = (element as unknown as Record<string, unknown>)[key];
  if (!isTransformKeyframeRoot(value)) {
    return {};
  }
  return value;
}

function isTransformKeyframeRoot(value: unknown): value is TransformKeyframeRoot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(isAnimatablePropertyTrack);
}

function isAnimatablePropertyTrack(value: unknown): value is AnimatablePropertyTrack {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { baseValue?: unknown; keyframes?: unknown };
  return typeof candidate.baseValue === 'number' && Array.isArray(candidate.keyframes);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readEasing(value: string | undefined): EasingType {
  return (value || 'linear') as EasingType;
}

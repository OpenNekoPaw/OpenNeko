/**
 * Keyframe Slice
 * 管理关键帧操作 - 支持 transform、audio、effects 和 mask 属性
 *
 * 已迁移到 EditOperation 系统：所有操作通过 dispatch keyframe.add/remove/update 提交。
 * 12 个 action 收敛为 3 种操作类型 × 4 种 KeyframeTarget。
 */

import { StateCreator } from 'zustand';
import type { ProjectData } from '../../types';
import type { EditorElement } from '../../types/editor-types';
import { getLogger } from '../../utils/logger';

const logger = getLogger('Keyframe');
import type {
  AnimatableProperty,
  AnimationKeyframe,
  ElementTransform,
} from '../../types/animation';
import type { EffectParameterKeyframe } from '../../types/effects';
import type {
  MaskShape,
  MaskEasingType,
  MaskPropertyKeyframe,
  MaskShapeKeyframe,
} from '../../types/mask';
import type { EditOperation } from '@neko/shared';
import { createDefaultElementTransform } from '../../types/animation';
import { createMaskPropertyKeyframe, createMaskShapeKeyframe } from '../../types/mask';
import { generateId } from '../../utils';
import { createMeta } from '../utils/operation-helpers';

// =============================================================================
// 依赖接口
// =============================================================================

interface ProjectDependency {
  project: ProjectData | null;
}

interface DispatchDependency {
  dispatch: (op: EditOperation) => void;
}

// =============================================================================
// Slice 接口
// =============================================================================

export interface KeyframeSlice {
  // Transform / Audio keyframe actions
  addKeyframe: (
    trackId: string,
    elementId: string,
    property: string,
    time: number,
    value: number,
  ) => void;
  removeKeyframe: (trackId: string, elementId: string, property: string, time: number) => void;
  updateKeyframe: (
    trackId: string,
    elementId: string,
    property: string,
    oldTime: number,
    newTime: number,
    newValue: number,
  ) => void;
  // Effect keyframe actions
  addEffectKeyframe: (
    trackId: string,
    elementId: string,
    effectId: string,
    paramKey: string,
    time: number,
    value: any,
  ) => void;
  removeEffectKeyframe: (
    trackId: string,
    elementId: string,
    effectId: string,
    paramKey: string,
    keyframeId: string,
  ) => void;
  updateEffectKeyframe: (
    trackId: string,
    elementId: string,
    effectId: string,
    paramKey: string,
    keyframeId: string,
    updates: Partial<EffectParameterKeyframe>,
  ) => void;
  // Mask property keyframe actions
  addMaskPropertyKeyframe: (
    trackId: string,
    elementId: string,
    maskId: string,
    property: 'feather' | 'expansion' | 'opacity',
    time: number,
    value: number,
    easing?: MaskEasingType,
  ) => void;
  removeMaskPropertyKeyframe: (
    trackId: string,
    elementId: string,
    maskId: string,
    property: 'feather' | 'expansion' | 'opacity',
    keyframeId: string,
  ) => void;
  updateMaskPropertyKeyframe: (
    trackId: string,
    elementId: string,
    maskId: string,
    property: 'feather' | 'expansion' | 'opacity',
    keyframeId: string,
    updates: Partial<MaskPropertyKeyframe>,
  ) => void;
  // Mask shape keyframe actions
  addMaskShapeKeyframe: (
    trackId: string,
    elementId: string,
    maskId: string,
    time: number,
    shape: MaskShape,
    easing?: MaskEasingType,
  ) => void;
  removeMaskShapeKeyframe: (
    trackId: string,
    elementId: string,
    maskId: string,
    keyframeId: string,
  ) => void;
  updateMaskShapeKeyframe: (
    trackId: string,
    elementId: string,
    maskId: string,
    keyframeId: string,
    updates: Partial<MaskShapeKeyframe>,
  ) => void;
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * Parse property path: "transform.x" → rootKey="transform", propKey="x"
 * "audio.volume" → rootKey="audio", propKey="volume"
 * "x" → rootKey="transform", propKey="x"
 */
function parsePropertyPath(property: string): { rootKey: string; propKey: string } {
  const parts = property.split('.');
  if (parts.length > 1) {
    return { rootKey: parts[0]!, propKey: parts[1]! };
  }
  return { rootKey: 'transform', propKey: parts[0]! };
}

/**
 * Find the animatable property from an element based on property path.
 * Only transform properties support keyframe animation.
 */
function findAnimatableProperty(
  element: EditorElement,
  property: string,
): AnimatableProperty | null {
  const { rootKey, propKey } = parsePropertyPath(property);

  if (rootKey === 'transform') {
    const animTransform = element.animTransform;
    if (!animTransform) return null;
    const prop = animTransform[propKey as keyof ElementTransform] as AnimatableProperty;
    return prop && typeof prop === 'object' && 'baseValue' in prop ? prop : null;
  }

  return null;
}

// =============================================================================
// Slice 创建器
// =============================================================================

export const createKeyframeSlice: StateCreator<
  KeyframeSlice & ProjectDependency & DispatchDependency,
  [],
  [],
  KeyframeSlice
> = (_set, get) => ({
  // =========================================================================
  // Transform / Audio Keyframe Actions
  // =========================================================================

  addKeyframe: (trackId, elementId, property, time, value) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element) return;

    const { rootKey, propKey } = parsePropertyPath(property);
    if (rootKey !== 'transform') {
      logger.warn(`Keyframes for ${rootKey} properties are not yet supported`);
      return;
    }

    // Validate property is animatable
    const animTransform = element.animTransform ?? createDefaultElementTransform();
    const animProp = animTransform[propKey as keyof ElementTransform] as AnimatableProperty;
    if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
      logger.warn(`Property ${property} is not animatable`);
      return;
    }

    const newKeyframe: AnimationKeyframe = {
      id: generateId(),
      time,
      value,
      easing: 'linear',
    };

    // Use 'transform' target kind with full property path (e.g., "audio.volume")
    // apply-keyframe.ts parsePropertyPath handles both transform and audio roots
    dispatch({
      type: 'keyframe.add',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'transform', property },
        keyframe: newKeyframe,
      },
    });
  },

  removeKeyframe: (trackId, elementId, property, time) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element) return;

    const { rootKey } = parsePropertyPath(property);
    if (rootKey !== 'transform') return;

    const animProp = findAnimatableProperty(element, property);
    if (!animProp) return;

    // Find keyframe to remove (for before data)
    const existingKeyframe = animProp.keyframes.find((kf) => Math.abs(kf.time - time) <= 0.01);
    if (!existingKeyframe) return;

    dispatch({
      type: 'keyframe.remove',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'transform', property },
        keyframeId: existingKeyframe.id,
        keyframeTime: time,
      },
      before: {
        keyframe: existingKeyframe,
        index: animProp.keyframes.indexOf(existingKeyframe),
      },
    });
  },

  updateKeyframe: (trackId, elementId, property, oldTime, newTime, newValue) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element) return;

    const { rootKey } = parsePropertyPath(property);
    if (rootKey !== 'transform') return;

    const animProp = findAnimatableProperty(element, property);
    if (!animProp) return;

    // Find existing keyframe
    const oldKeyframe = animProp.keyframes.find((kf) => Math.abs(kf.time - oldTime) <= 0.01);
    if (!oldKeyframe) return;

    const updates = { time: newTime, value: newValue };
    const beforeUpdates = { time: oldKeyframe.time, value: oldKeyframe.value };

    dispatch({
      type: 'keyframe.update',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'transform', property },
        keyframeId: oldKeyframe.id,
        keyframeTime: oldTime,
        updates,
      },
      before: { updates: beforeUpdates },
    });
  },

  // =========================================================================
  // Effect Keyframe Actions
  // =========================================================================

  addEffectKeyframe: (trackId, elementId, effectId, paramKey, time, value) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.effects) return;

    if (!element.effects.some((e) => e.id === effectId)) return;

    const newKeyframe: EffectParameterKeyframe = {
      id: generateId(),
      time,
      value,
      easing: 'linear',
    };

    dispatch({
      type: 'keyframe.add',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'effect', effectId, paramKey },
        keyframe: newKeyframe,
      },
    });
  },

  removeEffectKeyframe: (trackId, elementId, effectId, paramKey, keyframeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.effects) return;

    const effect = element.effects.find((e) => e.id === effectId);
    if (!effect) return;

    const animParam = effect.animatedParameters?.[paramKey];
    if (!animParam) return;

    const keyframe = animParam.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    dispatch({
      type: 'keyframe.remove',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'effect', effectId, paramKey },
        keyframeId,
        keyframeTime: keyframe.time,
      },
      before: {
        keyframe,
        index: animParam.keyframes.indexOf(keyframe),
      },
    });
  },

  updateEffectKeyframe: (trackId, elementId, effectId, paramKey, keyframeId, updates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.effects) return;

    const effect = element.effects.find((e) => e.id === effectId);
    if (!effect) return;

    const animParam = effect.animatedParameters?.[paramKey];
    if (!animParam) return;

    const keyframe = animParam.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    // Build before from existing keyframe
    const beforeUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      beforeUpdates[key] = (keyframe as unknown as Record<string, unknown>)[key];
    }

    dispatch({
      type: 'keyframe.update',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'effect', effectId, paramKey },
        keyframeId,
        keyframeTime: keyframe.time,
        updates: updates as Record<string, unknown>,
      },
      before: { updates: beforeUpdates },
    });
  },

  // =========================================================================
  // Mask Property Keyframe Actions
  // =========================================================================

  addMaskPropertyKeyframe: (
    trackId,
    elementId,
    maskId,
    property,
    time,
    value,
    easing = 'linear',
  ) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    if (!element.masks.some((m) => m.id === maskId)) return;

    const newKeyframe = createMaskPropertyKeyframe(time, value, easing);

    dispatch({
      type: 'keyframe.add',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'maskProperty', maskId, property },
        keyframe: newKeyframe,
      },
    });
  },

  removeMaskPropertyKeyframe: (trackId, elementId, maskId, property, keyframeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const mask = element.masks.find((m) => m.id === maskId);
    if (!mask) return;

    const animProp = mask.animation?.[property];
    if (!animProp) return;

    const keyframe = animProp.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    dispatch({
      type: 'keyframe.remove',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'maskProperty', maskId, property },
        keyframeId,
        keyframeTime: keyframe.time,
      },
      before: {
        keyframe,
        index: animProp.keyframes.indexOf(keyframe),
      },
    });
  },

  updateMaskPropertyKeyframe: (trackId, elementId, maskId, property, keyframeId, updates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const mask = element.masks.find((m) => m.id === maskId);
    if (!mask) return;

    const animProp = mask.animation?.[property];
    if (!animProp) return;

    const keyframe = animProp.keyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    const beforeUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      beforeUpdates[key] = (keyframe as unknown as Record<string, unknown>)[key];
    }

    dispatch({
      type: 'keyframe.update',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'maskProperty', maskId, property },
        keyframeId,
        keyframeTime: keyframe.time,
        updates: updates as Record<string, unknown>,
      },
      before: { updates: beforeUpdates },
    });
  },

  // =========================================================================
  // Mask Shape Keyframe Actions
  // =========================================================================

  addMaskShapeKeyframe: (trackId, elementId, maskId, time, shape, easing = 'linear') => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    if (!element.masks.some((m) => m.id === maskId)) return;

    const newKeyframe = createMaskShapeKeyframe(time, shape, easing);

    dispatch({
      type: 'keyframe.add',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'maskShape', maskId },
        keyframe: newKeyframe,
      },
    });
  },

  removeMaskShapeKeyframe: (trackId, elementId, maskId, keyframeId) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const mask = element.masks.find((m) => m.id === maskId);
    if (!mask) return;

    const shapeKeyframes = mask.animation?.shapeKeyframes;
    if (!shapeKeyframes) return;

    const keyframe = shapeKeyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    dispatch({
      type: 'keyframe.remove',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'maskShape', maskId },
        keyframeId,
        keyframeTime: keyframe.time,
      },
      before: {
        keyframe,
        index: shapeKeyframes.indexOf(keyframe),
      },
    });
  },

  updateMaskShapeKeyframe: (trackId, elementId, maskId, keyframeId, updates) => {
    const { project, dispatch } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === trackId);
    const element = track?.elements.find((e) => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const mask = element.masks.find((m) => m.id === maskId);
    if (!mask) return;

    const shapeKeyframes = mask.animation?.shapeKeyframes;
    if (!shapeKeyframes) return;

    const keyframe = shapeKeyframes.find((kf) => kf.id === keyframeId);
    if (!keyframe) return;

    const beforeUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      beforeUpdates[key] = (keyframe as unknown as Record<string, unknown>)[key];
    }

    dispatch({
      type: 'keyframe.update',
      meta: createMeta('user'),
      payload: {
        trackId,
        elementId,
        target: { kind: 'maskShape', maskId },
        keyframeId,
        keyframeTime: keyframe.time,
        updates: updates as Record<string, unknown>,
      },
      before: { updates: beforeUpdates },
    });
  },
});

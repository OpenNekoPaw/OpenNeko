// =============================================================================
// Apply Keyframe Operations — 关键帧操作的 apply 实现
// =============================================================================

import type { ProjectData } from '../types/project';
import type { KeyframeOperation, KeyframeTarget } from './types';
import type { Keyframe } from '../types/keyframe';
import type { EffectParameterKeyframe, AnimatableEffectParameter } from '../types/effects';
import type {
  MaskPropertyKeyframe,
  MaskShapeKeyframe,
  AnimatableMaskProperty,
  MaskAnimationData,
} from '../types/mask';
import type { WebviewElement, AnimatablePropertyTrack } from './webview-types';
import { updateElementInProject } from './helpers';
import { OperationError } from './errors';

// Union of all keyframe types used across transform / effect / mask operations
type AnyKeyframe = Keyframe | EffectParameterKeyframe | MaskPropertyKeyframe | MaskShapeKeyframe;

// Partial updates applied in keyframe.update operations
type AnyKeyframeUpdate =
  | Partial<Keyframe>
  | Partial<EffectParameterKeyframe>
  | Partial<MaskPropertyKeyframe>
  | Partial<MaskShapeKeyframe>;

// Minimal shape accepted by the match predicate — all keyframe variants satisfy this
type MatchableKeyframe = { time: number; id?: string };

/**
 * 解析 transform property 路径：
 * "transform.x" → rootKey="transform", propKey="x"
 * "audio.volume" → rootKey="audio", propKey="volume"
 * "x" → rootKey="transform", propKey="x"
 */
function parsePropertyPath(property: string): { rootKey: string; propKey: string } {
  const parts = property.split('.');
  if (parts.length === 2) {
    return { rootKey: parts[0]!, propKey: parts[1]! };
  }
  // 默认归属 transform
  return { rootKey: 'transform', propKey: parts[0]! };
}

/**
 * 读取元素上的动画属性根对象（animTransform 或 audio 等 UI-only 槽位）。
 * 使用 Record<string, unknown> 索引以支持动态 rootKey，返回 AnimatablePropertyTrack 字典。
 */
function getAnimRoot(
  el: WebviewElement,
  storeKey: string,
): Record<string, AnimatablePropertyTrack> {
  return ((el as unknown as Record<string, unknown>)[storeKey] ?? {}) as Record<
    string,
    AnimatablePropertyTrack
  >;
}

export function applyKeyframeOperation(project: ProjectData, op: KeyframeOperation): ProjectData {
  const { trackId, elementId, target } = op.payload;

  switch (op.type) {
    case 'keyframe.add':
      return applyKeyframeAdd(project, trackId, elementId, target, op.payload.keyframe);

    case 'keyframe.remove':
      return applyKeyframeRemove(
        project,
        trackId,
        elementId,
        target,
        op.payload.keyframeId,
        op.payload.keyframeTime,
      );

    case 'keyframe.update':
      return applyKeyframeUpdate(
        project,
        trackId,
        elementId,
        target,
        op.payload.keyframeId,
        op.payload.keyframeTime,
        op.payload.updates,
      );
  }
}

function applyKeyframeAdd(
  project: ProjectData,
  trackId: string,
  elementId: string,
  target: KeyframeTarget,
  keyframe: AnyKeyframe,
): ProjectData {
  return updateElementInProject(project, trackId, elementId, (element) => {
    const el = element as WebviewElement;

    switch (target.kind) {
      case 'transform': {
        const { rootKey, propKey } = parsePropertyPath(target.property);
        const storeKey = rootKey === 'transform' ? 'animTransform' : rootKey;
        const root = getAnimRoot(el, storeKey);
        const prop = root[propKey] ?? { baseValue: 0, keyframes: [] };
        const kf = keyframe as Keyframe;
        const newKeyframes = [...prop.keyframes, kf].sort((a, b) => a.time - b.time);
        return {
          ...element,
          [storeKey]: { ...root, [propKey]: { ...prop, keyframes: newKeyframes } },
        } as WebviewElement;
      }

      case 'effect': {
        const effects = [...(el.effects ?? [])];
        const effectIdx = effects.findIndex((e) => e.id === target.effectId);
        if (effectIdx === -1) throw OperationError.effectNotFound(target.effectId);
        const effect = { ...effects[effectIdx]! };
        const animParams = { ...(effect.animatedParameters ?? {}) };
        const param: AnimatableEffectParameter = animParams[target.paramKey] ?? {
          baseValue: 0,
          keyframes: [],
        };
        const kf = keyframe as EffectParameterKeyframe;
        const newKeyframes = [...param.keyframes, kf].sort((a, b) => a.time - b.time);
        animParams[target.paramKey] = { ...param, keyframes: newKeyframes };
        effect.animatedParameters = animParams;
        effects[effectIdx] = effect;
        return { ...element, effects } as WebviewElement;
      }

      case 'maskProperty': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx]! };
        const animation: MaskAnimationData = { ...(mask.animation ?? {}) };
        const prop: AnimatableMaskProperty = animation[target.property] ?? {
          baseValue: 0,
          keyframes: [],
        };
        const kf = keyframe as MaskPropertyKeyframe;
        const newKeyframes = [...prop.keyframes, kf].sort((a, b) => a.time - b.time);
        animation[target.property] = { ...prop, keyframes: newKeyframes };
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as WebviewElement;
      }

      case 'maskShape': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx]! };
        const animation: MaskAnimationData = { ...(mask.animation ?? {}) };
        const kf = keyframe as MaskShapeKeyframe;
        const shapeKeyframes = [...(animation.shapeKeyframes ?? []), kf].sort(
          (a, b) => a.time - b.time,
        );
        animation.shapeKeyframes = shapeKeyframes;
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as WebviewElement;
      }
    }
  });
}

function applyKeyframeRemove(
  project: ProjectData,
  trackId: string,
  elementId: string,
  target: KeyframeTarget,
  keyframeId?: string,
  keyframeTime?: number,
): ProjectData {
  const matchFn = (kf: MatchableKeyframe): boolean =>
    keyframeId !== undefined ? kf.id === keyframeId : kf.time === keyframeTime;

  return updateElementInProject(project, trackId, elementId, (element) => {
    const el = element as WebviewElement;

    switch (target.kind) {
      case 'transform': {
        const { rootKey, propKey } = parsePropertyPath(target.property);
        const storeKey = rootKey === 'transform' ? 'animTransform' : rootKey;
        const root = getAnimRoot(el, storeKey);
        const prop = root[propKey];
        if (!prop) return element;
        return {
          ...element,
          [storeKey]: {
            ...root,
            [propKey]: { ...prop, keyframes: prop.keyframes.filter((kf) => !matchFn(kf)) },
          },
        } as WebviewElement;
      }

      case 'effect': {
        const effects = [...(el.effects ?? [])];
        const effectIdx = effects.findIndex((e) => e.id === target.effectId);
        if (effectIdx === -1) throw OperationError.effectNotFound(target.effectId);
        const effect = { ...effects[effectIdx]! };
        const animParams = { ...(effect.animatedParameters ?? {}) };
        const param = animParams[target.paramKey];
        if (!param) return element;
        animParams[target.paramKey] = {
          ...param,
          keyframes: param.keyframes.filter((kf) => !matchFn(kf)),
        };
        effect.animatedParameters = animParams;
        effects[effectIdx] = effect;
        return { ...element, effects } as WebviewElement;
      }

      case 'maskProperty': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx]! };
        const animation: MaskAnimationData = { ...(mask.animation ?? {}) };
        const prop = animation[target.property];
        if (!prop) return element;
        animation[target.property] = {
          ...prop,
          keyframes: prop.keyframes.filter((kf) => !matchFn(kf)),
        };
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as WebviewElement;
      }

      case 'maskShape': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx]! };
        const animation: MaskAnimationData = { ...(mask.animation ?? {}) };
        animation.shapeKeyframes = (animation.shapeKeyframes ?? []).filter((kf) => !matchFn(kf));
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as WebviewElement;
      }
    }
  });
}

function applyKeyframeUpdate(
  project: ProjectData,
  trackId: string,
  elementId: string,
  target: KeyframeTarget,
  keyframeId: string | undefined,
  keyframeTime: number | undefined,
  updates: AnyKeyframeUpdate,
): ProjectData {
  const matchFn = (kf: MatchableKeyframe): boolean =>
    keyframeId !== undefined ? kf.id === keyframeId : kf.time === keyframeTime;

  return updateElementInProject(project, trackId, elementId, (element) => {
    const el = element as WebviewElement;

    switch (target.kind) {
      case 'transform': {
        const { rootKey, propKey } = parsePropertyPath(target.property);
        const storeKey = rootKey === 'transform' ? 'animTransform' : rootKey;
        const root = getAnimRoot(el, storeKey);
        const prop = root[propKey];
        if (!prop) return element;
        let newKeyframes = prop.keyframes.map((kf) =>
          matchFn(kf) ? ({ ...kf, ...updates } as Keyframe) : kf,
        );
        if ('time' in updates) {
          newKeyframes = newKeyframes.sort((a, b) => a.time - b.time);
        }
        return {
          ...element,
          [storeKey]: { ...root, [propKey]: { ...prop, keyframes: newKeyframes } },
        } as WebviewElement;
      }

      case 'effect': {
        const effects = [...(el.effects ?? [])];
        const effectIdx = effects.findIndex((e) => e.id === target.effectId);
        if (effectIdx === -1) throw OperationError.effectNotFound(target.effectId);
        const effect = { ...effects[effectIdx]! };
        const animParams = { ...(effect.animatedParameters ?? {}) };
        const param = animParams[target.paramKey];
        if (!param) return element;
        let newKeyframes = param.keyframes.map((kf) =>
          matchFn(kf) ? ({ ...kf, ...updates } as EffectParameterKeyframe) : kf,
        );
        if ('time' in updates) {
          newKeyframes = newKeyframes.sort((a, b) => a.time - b.time);
        }
        animParams[target.paramKey] = { ...param, keyframes: newKeyframes };
        effect.animatedParameters = animParams;
        effects[effectIdx] = effect;
        return { ...element, effects } as WebviewElement;
      }

      case 'maskProperty': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx]! };
        const animation: MaskAnimationData = { ...(mask.animation ?? {}) };
        const prop = animation[target.property];
        if (!prop) return element;
        let newKeyframes = prop.keyframes.map((kf) =>
          matchFn(kf) ? ({ ...kf, ...updates } as MaskPropertyKeyframe) : kf,
        );
        if ('time' in updates) {
          newKeyframes = newKeyframes.sort((a, b) => a.time - b.time);
        }
        animation[target.property] = { ...prop, keyframes: newKeyframes };
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as WebviewElement;
      }

      case 'maskShape': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx]! };
        const animation: MaskAnimationData = { ...(mask.animation ?? {}) };
        let shapeKeyframes = (animation.shapeKeyframes ?? []).map((kf) =>
          matchFn(kf) ? ({ ...kf, ...updates } as MaskShapeKeyframe) : kf,
        );
        if ('time' in updates) {
          shapeKeyframes = shapeKeyframes.sort((a, b) => a.time - b.time);
        }
        animation.shapeKeyframes = shapeKeyframes;
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as WebviewElement;
      }
    }
  });
}

/**
 * Composite layer builder utility.
 * Extracted from PreviewPanel.tsx.
 */

import type { ProjectData, MediaElement, CompositeLayerConfig, Transform } from '@neko/shared';
import type { ElementTransform } from '../../types/animation';
import type {
  EditorElement,
  EditorShapeElement,
  EditorSubtitleElement,
  EditorTextElement,
} from '../../types/editor-types';
import { getComputedTransform } from '../../utils/animation';
import {
  getClipSourceTimeAtDisplayTime,
  getClipTimelineDuration,
} from '../../utils/clipThumbnails';
import { getEffectParametersAtTime } from '../../types/effects';
import {
  buildCompositeMasks,
  applyTransitions,
  colorCorrectionToCompositeEffect,
} from '../../utils/composite-helpers';

export type PausedPreviewOverlayElement =
  | {
      type: 'text';
      element: EditorTextElement;
      transform: Transform;
      opacity: number;
      zIndex: number;
    }
  | {
      type: 'subtitle';
      element: EditorSubtitleElement;
      transform: Transform;
      opacity: number;
      zIndex: number;
    }
  | {
      type: 'shape';
      element: EditorShapeElement;
      opacity: number;
      zIndex: number;
    };

function getElementTransition(
  element: EditorElement,
  key: 'transitionIn' | 'transitionOut',
): EditorElement['transitionIn'] | EditorElement['transitionOut'] | undefined {
  return element[key];
}

function getCompositeSourceTime(element: EditorElement, time: number): number {
  const localTimelineTime = Math.max(0, time - element.startTime);
  return getClipSourceTimeAtDisplayTime(element, localTimelineTime);
}

function isElementVisibleAtTime(element: EditorElement, time: number): boolean {
  if (element.hidden) return false;
  const elementEnd = element.startTime + getClipTimelineDuration(element);
  return time >= element.startTime && time < elementEnd;
}

function getElementTransformState(
  element: EditorElement,
  time: number,
): { transform: Transform; opacity: number } {
  const sourceTime = getCompositeSourceTime(element, time);
  const animTransform = (element as { animTransform?: ElementTransform }).animTransform;

  if (animTransform) {
    const computed = getComputedTransform(animTransform, sourceTime);
    return {
      transform: {
        x: computed.x,
        y: computed.y,
        scaleX: computed.scaleX,
        scaleY: computed.scaleY,
        rotation: computed.rotation,
        anchorX: computed.anchorX,
        anchorY: computed.anchorY,
      },
      opacity: computed.opacity,
    };
  }

  if (element.transform) {
    return {
      transform: element.transform,
      opacity: element.opacity ?? 1,
    };
  }

  return {
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: element.opacity ?? 1,
  };
}

/**
 * Build CompositeLayerConfig[] from ProjectData at a given time.
 * Extracts all visible media elements at the specified time point.
 *
 * Priority: animTransform (keyframe interpolation) > element.transform (engine static) > centered defaults.
 */
export function buildCompositeLayers(project: ProjectData, time: number): CompositeLayerConfig[] {
  const layers: CompositeLayerConfig[] = [];
  let zIndex = 0;

  for (const track of project.tracks) {
    for (const element of track.elements) {
      if (element.type !== 'media') continue;
      if (element.hidden) continue;

      const editorElement = element as EditorElement;
      const elementEnd = element.startTime + getClipTimelineDuration(editorElement);
      if (time < element.startTime || time >= elementEnd) continue;

      const mediaElement = element as MediaElement;
      const sourceTime = getCompositeSourceTime(editorElement, time);

      // EditorElement may carry animTransform (UI keyframe animation layer)
      const animTransform = (element as { animTransform?: ElementTransform }).animTransform;

      let x: number, y: number, scaleX: number, scaleY: number;
      let rotation: number, anchorX: number, anchorY: number, opacity: number;

      if (animTransform) {
        const localTime = sourceTime;
        const computed = getComputedTransform(animTransform, localTime);
        x = computed.x;
        y = computed.y;
        scaleX = computed.scaleX;
        scaleY = computed.scaleY;
        rotation = computed.rotation;
        anchorX = computed.anchorX;
        anchorY = computed.anchorY;
        opacity = computed.opacity;
      } else if (element.transform) {
        x = element.transform.x;
        y = element.transform.y;
        scaleX = element.transform.scaleX;
        scaleY = element.transform.scaleY;
        rotation = element.transform.rotation;
        anchorX = element.transform.anchorX;
        anchorY = element.transform.anchorY;
        opacity = element.opacity;
      } else {
        x = 0.5;
        y = 0.5;
        scaleX = 1;
        scaleY = 1;
        rotation = 0;
        anchorX = 0.5;
        anchorY = 0.5;
        opacity = element.opacity ?? 1;
      }

      const layer: CompositeLayerConfig = {
        elementId: element.id,
        source: mediaElement.src,
        sourceTime,
        transform: { x, y, scaleX, scaleY, rotation, anchorX, anchorY },
        opacity,
        zIndex: zIndex++,
        ...(element.blendMode &&
          element.blendMode !== 'normal' && { blendMode: element.blendMode }),
      };

      // Flow effects to composite layer
      if (element.effects && element.effects.length > 0) {
        const localTime = element.trimStart + (time - element.startTime);
        layer.effects = element.effects
          .filter((e) => e.enabled)
          .sort((a, b) => a.order - b.order)
          .map((e) => ({
            type: e.type,
            parameters: getEffectParametersAtTime(e, localTime) as Record<
              string,
              number | string | boolean
            >,
            order: e.order,
          }));
      }

      // Flow colorCorrection to composite layer as a color-correction effect
      if (editorElement.colorCorrection) {
        const ccEffect = colorCorrectionToCompositeEffect(editorElement.colorCorrection);
        if (ccEffect) {
          if (!layer.effects) layer.effects = [];
          layer.effects.unshift(ccEffect);
        }
      }

      // Flow masks to composite layer
      if (editorElement.masks && editorElement.masks.length > 0) {
        const localTime = element.trimStart + (time - element.startTime);
        layer.masks = buildCompositeMasks(editorElement.masks, localTime);
      }

      layers.push(layer);
    }
  }

  // Apply transitions between adjacent elements on the same track
  const trackElements = project.tracks.map((track) => ({
    elements: track.elements
      .filter((e) => e.type === 'media')
      .sort((a, b) => a.startTime - b.startTime)
      .map((e) => {
        const editorElement = e as EditorElement;
        const transitionIn = getElementTransition(editorElement, 'transitionIn');
        const transitionOut = getElementTransition(editorElement, 'transitionOut');

        return {
          id: e.id,
          startTime: e.startTime,
          duration: getClipTimelineDuration(e as EditorElement),
          transitionIn: transitionIn
            ? {
                type: transitionIn.type,
                duration: transitionIn.duration,
                easing: transitionIn.easing,
              }
            : undefined,
          transitionOut: transitionOut
            ? {
                type: transitionOut.type,
                duration: transitionOut.duration,
                easing: transitionOut.easing,
              }
            : undefined,
        };
      }),
  }));
  applyTransitions(layers, trackElements, time);

  return layers;
}

export function buildPausedPreviewOverlayElements(
  project: ProjectData,
  time: number,
): PausedPreviewOverlayElement[] {
  const overlays: PausedPreviewOverlayElement[] = [];
  let zIndex = 0;

  for (const track of project.tracks) {
    for (const rawElement of track.elements) {
      const element = rawElement as EditorElement;
      if (!isElementVisibleAtTime(element, time)) continue;

      if (element.type === 'text') {
        const { transform, opacity } = getElementTransformState(element, time);
        overlays.push({
          type: 'text',
          element: element as EditorTextElement,
          transform,
          opacity,
          zIndex: zIndex++,
        });
        continue;
      }

      if (element.type === 'subtitle') {
        const { transform, opacity } = getElementTransformState(element, time);
        overlays.push({
          type: 'subtitle',
          element: element as EditorSubtitleElement,
          transform,
          opacity,
          zIndex: zIndex++,
        });
        continue;
      }

      if (element.type === 'shape') {
        overlays.push({
          type: 'shape',
          element: element as EditorShapeElement,
          opacity: element.opacity ?? 1,
          zIndex: zIndex++,
        });
      }
    }
  }

  return overlays;
}

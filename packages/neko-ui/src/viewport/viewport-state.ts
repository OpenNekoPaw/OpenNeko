import type {
  ViewportAffine2D,
  ViewportKeyInput,
  ViewportModifierState,
  ViewportPointerInput,
  ViewportPointerPhase,
  ViewportPointerType,
  ViewportVec2,
  ViewportWheelInput,
} from '@neko/shared';
import type React from 'react';

export type ViewportLocalQuality = 'auto' | 'low' | 'medium' | 'high';

export interface ViewportSurfaceSize {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface ViewportLocalState {
  readonly pan: ViewportVec2;
  readonly zoom: number;
  readonly quality: ViewportLocalQuality;
  readonly size: ViewportSurfaceSize;
}

export type ViewportLocalCommand =
  | { readonly type: 'panBy'; readonly delta: ViewportVec2 }
  | { readonly type: 'zoomBy'; readonly origin: ViewportVec2; readonly delta: number }
  | { readonly type: 'resize'; readonly size: ViewportSurfaceSize }
  | { readonly type: 'quality'; readonly quality: ViewportLocalQuality };

export const DEFAULT_VIEWPORT_LOCAL_STATE: ViewportLocalState = {
  pan: [0, 0],
  zoom: 1,
  quality: 'auto',
  size: { width: 1, height: 1, pixelRatio: 1 },
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;

export function reduceViewportLocalState(
  state: ViewportLocalState,
  command: ViewportLocalCommand,
): ViewportLocalState {
  switch (command.type) {
    case 'panBy':
      return {
        ...state,
        pan: [state.pan[0] + command.delta[0], state.pan[1] + command.delta[1]],
      };
    case 'zoomBy': {
      const nextZoom = clampZoom(state.zoom * Math.exp(-command.delta * 0.001));
      return {
        ...state,
        zoom: nextZoom,
      };
    }
    case 'resize':
      return {
        ...state,
        size: {
          width: Math.max(1, Math.round(command.size.width)),
          height: Math.max(1, Math.round(command.size.height)),
          pixelRatio: clampPositive(command.size.pixelRatio, 1),
        },
      };
    case 'quality':
      return { ...state, quality: command.quality };
  }
}

export function applyViewportTransform(
  transform: ViewportAffine2D,
  point: ViewportVec2,
): ViewportVec2 {
  const [a, b, c, d, tx, ty] = transform;
  return [a * point[0] + c * point[1] + tx, b * point[0] + d * point[1] + ty];
}

export function createViewportPointerInput(
  sceneId: string,
  viewportId: string,
  phase: ViewportPointerPhase,
  event: Pick<
    React.PointerEvent,
    | 'pointerId'
    | 'pointerType'
    | 'clientX'
    | 'clientY'
    | 'buttons'
    | 'button'
    | 'pressure'
    | 'altKey'
    | 'ctrlKey'
    | 'metaKey'
    | 'shiftKey'
  >,
  rect: Pick<DOMRect, 'left' | 'top'>,
  timestamp = Date.now(),
): ViewportPointerInput {
  return {
    kind: 'pointer',
    sceneId,
    viewportId,
    timestamp,
    modifiers: readModifiers(event),
    phase,
    pointerId: event.pointerId,
    pointerType: normalizePointerType(event.pointerType),
    position: [event.clientX - rect.left, event.clientY - rect.top],
    buttons: event.buttons,
    button: event.button,
    pressure: event.pressure,
  };
}

export function createViewportWheelInput(
  sceneId: string,
  viewportId: string,
  event: Pick<
    React.WheelEvent,
    | 'clientX'
    | 'clientY'
    | 'deltaX'
    | 'deltaY'
    | 'deltaMode'
    | 'altKey'
    | 'ctrlKey'
    | 'metaKey'
    | 'shiftKey'
  >,
  rect: Pick<DOMRect, 'left' | 'top'>,
  timestamp = Date.now(),
): ViewportWheelInput {
  return {
    kind: 'wheel',
    sceneId,
    viewportId,
    timestamp,
    modifiers: readModifiers(event),
    position: [event.clientX - rect.left, event.clientY - rect.top],
    delta: [event.deltaX, event.deltaY],
    deltaMode: event.deltaMode === 1 ? 'line' : event.deltaMode === 2 ? 'page' : 'pixel',
  };
}

export function createViewportKeyInput(
  sceneId: string,
  viewportId: string,
  phase: 'down' | 'up',
  event: Pick<
    React.KeyboardEvent,
    'key' | 'code' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  >,
  timestamp = Date.now(),
): ViewportKeyInput {
  return {
    kind: 'key',
    sceneId,
    viewportId,
    timestamp,
    modifiers: readModifiers(event),
    phase,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
  };
}

function readModifiers(event: {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}): ViewportModifierState {
  return {
    alt: event.altKey === true,
    ctrl: event.ctrlKey === true,
    meta: event.metaKey === true,
    shift: event.shiftKey === true,
  };
}

function normalizePointerType(value: string): ViewportPointerType {
  return value === 'mouse' || value === 'pen' || value === 'touch' ? value : 'unknown';
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

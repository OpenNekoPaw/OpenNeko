/**
 * Transition Types - Transition effect system
 * 转场效果系统类型定义
 *
 * Core types are imported from @neko/shared for Single Source of Truth.
 * This file extends with webview-specific utilities (i18n keys, icons, presets).
 *
 * Engine supports exactly 18 transition types (see packages/neko-proto/timeline.proto).
 */

// =============================================================================
// Re-export Core Types from Shared
// =============================================================================

export type {
  TransitionType,
  TransitionDirection,
  TransitionParams,
  Transition,
  TransitionPlacement,
  ElementTransition,
  EasingType,
} from '@neko/shared';

import type {
  TransitionType,
  Transition,
  TransitionParams,
  TransitionPlacement,
  EasingType,
} from '@neko/shared';

// =============================================================================
// Webview-Specific Extensions: i18n Keys
// =============================================================================

/**
 * Transition type translation keys for i18n
 * Aligned with engine's 18 transition types
 */
export const TRANSITION_TYPE_I18N_KEYS: Record<TransitionType, string> = {
  fade: 'transition.type.fade',
  dissolve: 'transition.type.dissolve',
  'wipe-left': 'transition.type.wipeLeft',
  'wipe-right': 'transition.type.wipeRight',
  'wipe-up': 'transition.type.wipeUp',
  'wipe-down': 'transition.type.wipeDown',
  'slide-left': 'transition.type.slideLeft',
  'slide-right': 'transition.type.slideRight',
  'zoom-in': 'transition.type.zoomIn',
  'zoom-out': 'transition.type.zoomOut',
  'iris-circle': 'transition.type.irisCircle',
  'iris-rectangle': 'transition.type.irisRectangle',
  clock: 'transition.type.clock',
  pixelate: 'transition.type.pixelate',
  ripple: 'transition.type.ripple',
  swirl: 'transition.type.swirl',
  glitch: 'transition.type.glitch',
  flash: 'transition.type.flash',
};

/**
 * Transition icons for UI display
 * Aligned with engine's 18 transition types
 */
export const TRANSITION_ICONS: Record<TransitionType, string> = {
  fade: '◐',
  dissolve: '◑',
  'wipe-left': '▌',
  'wipe-right': '▐',
  'wipe-up': '▀',
  'wipe-down': '▄',
  'slide-left': '←',
  'slide-right': '→',
  'zoom-in': '⊕',
  'zoom-out': '⊖',
  'iris-circle': '◎',
  'iris-rectangle': '▣',
  clock: '◷',
  pixelate: '▦',
  ripple: '◉',
  swirl: '🌀',
  glitch: '⚡',
  flash: '☀',
};

// =============================================================================
// Webview-Specific Extensions: Transition Presets
// =============================================================================

/**
 * Transition preset for quick selection
 */
export interface TransitionPreset {
  type: TransitionType;
  i18nKey: string;
  icon: string;
  defaultDuration: number;
  defaultEasing: EasingType;
  params?: TransitionParams;
}

/**
 * Default transition presets — engine-supported types only
 */
export const TRANSITION_PRESETS: TransitionPreset[] = [
  // Basic
  {
    type: 'fade',
    i18nKey: 'transition.preset.fade',
    icon: '◐',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'dissolve',
    i18nKey: 'transition.preset.dissolve',
    icon: '◑',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
  },
  // Wipe
  {
    type: 'wipe-left',
    i18nKey: 'transition.preset.wipeLeft',
    icon: '▌',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
    params: { softness: 0.05 },
  },
  {
    type: 'wipe-right',
    i18nKey: 'transition.preset.wipeRight',
    icon: '▐',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
    params: { softness: 0.05 },
  },
  {
    type: 'wipe-up',
    i18nKey: 'transition.preset.wipeUp',
    icon: '▀',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
    params: { softness: 0.05 },
  },
  {
    type: 'wipe-down',
    i18nKey: 'transition.preset.wipeDown',
    icon: '▄',
    defaultDuration: 0.5,
    defaultEasing: 'linear',
    params: { softness: 0.05 },
  },
  // Slide
  {
    type: 'slide-left',
    i18nKey: 'transition.preset.slideLeft',
    icon: '←',
    defaultDuration: 0.3,
    defaultEasing: 'ease-out',
  },
  {
    type: 'slide-right',
    i18nKey: 'transition.preset.slideRight',
    icon: '→',
    defaultDuration: 0.3,
    defaultEasing: 'ease-out',
  },
  // Zoom
  {
    type: 'zoom-in',
    i18nKey: 'transition.preset.zoomIn',
    icon: '⊕',
    defaultDuration: 0.4,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'zoom-out',
    i18nKey: 'transition.preset.zoomOut',
    icon: '⊖',
    defaultDuration: 0.4,
    defaultEasing: 'ease-in-out',
  },
  // Iris
  {
    type: 'iris-circle',
    i18nKey: 'transition.preset.irisCircle',
    icon: '◎',
    defaultDuration: 0.5,
    defaultEasing: 'ease-out',
  },
  {
    type: 'iris-rectangle',
    i18nKey: 'transition.preset.irisRectangle',
    icon: '▣',
    defaultDuration: 0.5,
    defaultEasing: 'ease-out',
  },
  // Clock
  {
    type: 'clock',
    i18nKey: 'transition.preset.clock',
    icon: '◷',
    defaultDuration: 0.6,
    defaultEasing: 'linear',
  },
  // Special
  {
    type: 'pixelate',
    i18nKey: 'transition.preset.pixelate',
    icon: '▦',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'ripple',
    i18nKey: 'transition.preset.ripple',
    icon: '◉',
    defaultDuration: 0.5,
    defaultEasing: 'ease-out',
  },
  {
    type: 'swirl',
    i18nKey: 'transition.preset.swirl',
    icon: '~',
    defaultDuration: 0.5,
    defaultEasing: 'ease-in-out',
  },
  {
    type: 'glitch',
    i18nKey: 'transition.preset.glitch',
    icon: '!',
    defaultDuration: 0.4,
    defaultEasing: 'linear',
  },
  {
    type: 'flash',
    i18nKey: 'transition.preset.flash',
    icon: '*',
    defaultDuration: 0.3,
    defaultEasing: 'ease-in-out',
  },
];

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Create a default transition
 */
export function createTransition(
  type: TransitionType = 'fade',
  duration: number = 0.5,
  easing: EasingType = 'ease-in-out',
): Transition {
  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type,
    duration,
    easing,
  };
}

/**
 * Create an element transition
 */
export function createElementTransition(
  fromElementId: string,
  toElementId: string,
  transition: Transition,
  placement: TransitionPlacement = 'overlap',
) {
  return {
    id: `etr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    fromElementId,
    toElementId,
    transition,
    placement,
  };
}

/**
 * Create a transition from preset
 */
export function createTransitionFromPreset(preset: TransitionPreset): Transition {
  return {
    id: `tr-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: preset.type,
    duration: preset.defaultDuration,
    easing: preset.defaultEasing,
    params: preset.params,
  };
}

// =============================================================================
// Webview-Specific Extensions: Utility Functions
// =============================================================================

/**
 * Get transition icon
 */
export function getTransitionIcon(type: TransitionType): string {
  return TRANSITION_ICONS[type] || '◆';
}

/**
 * Check if a transition type is directional
 */
export function isDirectionalTransition(type: TransitionType): boolean {
  return ['slide-left', 'slide-right', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down'].includes(
    type,
  );
}

/**
 * Get opposite transition type (for reverse direction)
 */
export function getOppositeTransition(type: TransitionType): TransitionType {
  const opposites: Partial<Record<TransitionType, TransitionType>> = {
    'slide-left': 'slide-right',
    'slide-right': 'slide-left',
    'wipe-left': 'wipe-right',
    'wipe-right': 'wipe-left',
    'wipe-up': 'wipe-down',
    'wipe-down': 'wipe-up',
    'zoom-in': 'zoom-out',
    'zoom-out': 'zoom-in',
    'iris-circle': 'iris-rectangle',
    'iris-rectangle': 'iris-circle',
  };
  return opposites[type] || type;
}

/**
 * Get transition category
 */
export type TransitionCategory = 'basic' | 'slide' | 'zoom' | 'wipe' | 'iris' | 'clock' | 'special';

export function getTransitionCategory(type: TransitionType): TransitionCategory {
  if (['fade', 'dissolve'].includes(type)) return 'basic';
  if (type.startsWith('slide-')) return 'slide';
  if (type.startsWith('zoom-')) return 'zoom';
  if (type.startsWith('wipe-')) return 'wipe';
  if (type.startsWith('iris-')) return 'iris';
  if (type === 'clock') return 'clock';
  return 'special';
}

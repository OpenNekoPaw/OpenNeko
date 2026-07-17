/**
 * Blend Modes Types — Aligned with Engine (gpu/compositor.rs)
 * 混合模式类型定义
 *
 * Authority: packages/neko-proto/timeline.proto → BlendMode
 * Core type re-exported from @neko/shared as BlendModeType.
 * This file provides webview-specific metadata (i18n, CSS mapping, categories).
 *
 * 实现标准图层混合模式，与 Adobe After Effects / Premiere / Photoshop 兼容
 * 命名格式：camelCase（与引擎 serde rename_all = "camelCase" 一致）
 */

// Re-export core type from shared (Single Source of Truth)
export type { BlendModeType } from '@neko/shared';
import type { BlendModeType } from '@neko/shared';

// =============================================================================
// Blend Mode Categories
// =============================================================================

/**
 * Blend mode category
 * 混合模式分类
 */
export type BlendModeCategory =
  'normal' | 'darken' | 'lighten' | 'contrast' | 'inversion' | 'component';

// =============================================================================
// Blend Mode Definitions with Metadata
// =============================================================================

/**
 * Blend mode definition with metadata
 * 带元数据的混合模式定义
 */
export interface BlendModeDefinition {
  /** Blend mode identifier (camelCase, matches engine) */
  mode: BlendModeType;
  /** Display name (i18n key) */
  nameKey: string;
  /** Category */
  category: BlendModeCategory;
  /** CSS mix-blend-mode value (if supported) */
  cssValue?: string;
  /** Whether it's not supported by Canvas 2D (requires custom shader) */
  notSupported?: boolean;
}

/**
 * All available blend modes with metadata
 * 所有可用的混合模式及元数据
 *
 * mode: camelCase (engine format)
 * cssValue: kebab-case (CSS format)
 */
export const BLEND_MODE_DEFINITIONS: BlendModeDefinition[] = [
  // Normal
  { mode: 'normal', nameKey: 'blendMode.normal', category: 'normal', cssValue: 'normal' },
  { mode: 'dissolve', nameKey: 'blendMode.dissolve', category: 'normal', notSupported: true },

  // Darken Group
  { mode: 'darken', nameKey: 'blendMode.darken', category: 'darken', cssValue: 'darken' },
  { mode: 'multiply', nameKey: 'blendMode.multiply', category: 'darken', cssValue: 'multiply' },
  { mode: 'colorBurn', nameKey: 'blendMode.colorBurn', category: 'darken', cssValue: 'color-burn' },
  { mode: 'linearBurn', nameKey: 'blendMode.linearBurn', category: 'darken', notSupported: true },
  { mode: 'darkerColor', nameKey: 'blendMode.darkerColor', category: 'darken', notSupported: true },

  // Lighten Group
  { mode: 'lighten', nameKey: 'blendMode.lighten', category: 'lighten', cssValue: 'lighten' },
  { mode: 'screen', nameKey: 'blendMode.screen', category: 'lighten', cssValue: 'screen' },
  {
    mode: 'colorDodge',
    nameKey: 'blendMode.colorDodge',
    category: 'lighten',
    cssValue: 'color-dodge',
  },
  {
    mode: 'linearDodge',
    nameKey: 'blendMode.linearDodge',
    category: 'lighten',
    notSupported: true,
  },
  {
    mode: 'lighterColor',
    nameKey: 'blendMode.lighterColor',
    category: 'lighten',
    notSupported: true,
  },

  // Contrast Group
  { mode: 'overlay', nameKey: 'blendMode.overlay', category: 'contrast', cssValue: 'overlay' },
  {
    mode: 'softLight',
    nameKey: 'blendMode.softLight',
    category: 'contrast',
    cssValue: 'soft-light',
  },
  {
    mode: 'hardLight',
    nameKey: 'blendMode.hardLight',
    category: 'contrast',
    cssValue: 'hard-light',
  },
  { mode: 'vividLight', nameKey: 'blendMode.vividLight', category: 'contrast', notSupported: true },
  {
    mode: 'linearLight',
    nameKey: 'blendMode.linearLight',
    category: 'contrast',
    notSupported: true,
  },
  { mode: 'pinLight', nameKey: 'blendMode.pinLight', category: 'contrast', notSupported: true },
  { mode: 'hardMix', nameKey: 'blendMode.hardMix', category: 'contrast', notSupported: true },

  // Inversion Group
  {
    mode: 'difference',
    nameKey: 'blendMode.difference',
    category: 'inversion',
    cssValue: 'difference',
  },
  {
    mode: 'exclusion',
    nameKey: 'blendMode.exclusion',
    category: 'inversion',
    cssValue: 'exclusion',
  },
  { mode: 'subtract', nameKey: 'blendMode.subtract', category: 'inversion', notSupported: true },
  { mode: 'divide', nameKey: 'blendMode.divide', category: 'inversion', notSupported: true },

  // Component Group
  { mode: 'hue', nameKey: 'blendMode.hue', category: 'component', cssValue: 'hue' },
  {
    mode: 'saturation',
    nameKey: 'blendMode.saturation',
    category: 'component',
    cssValue: 'saturation',
  },
  { mode: 'color', nameKey: 'blendMode.color', category: 'component', cssValue: 'color' },
  {
    mode: 'luminosity',
    nameKey: 'blendMode.luminosity',
    category: 'component',
    cssValue: 'luminosity',
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get blend mode definition by mode
 * 根据模式获取混合模式定义
 */
export function getBlendModeDefinition(mode: BlendModeType): BlendModeDefinition | undefined {
  return BLEND_MODE_DEFINITIONS.find((d) => d.mode === mode);
}

/**
 * Get blend modes by category
 * 按分类获取混合模式
 */
export function getBlendModesByCategory(category: BlendModeCategory): BlendModeDefinition[] {
  return BLEND_MODE_DEFINITIONS.filter((d) => d.category === category);
}

/**
 * Get CSS-supported blend modes
 * 获取 CSS 支持的混合模式
 */
export function getCSSBlendModes(): BlendModeDefinition[] {
  return BLEND_MODE_DEFINITIONS.filter((d) => d.cssValue);
}

/**
 * Get unsupported blend modes (require custom shader)
 * 获取不支持的混合模式（需要自定义 shader）
 */
export function getUnsupportedBlendModes(): BlendModeDefinition[] {
  return BLEND_MODE_DEFINITIONS.filter((d) => d.notSupported);
}

/**
 * Get CSS value for a blend mode
 * 获取混合模式的 CSS 值
 *
 * @param mode - Blend mode (camelCase)
 * @returns CSS mix-blend-mode value (kebab-case), or 'normal' if not CSS-supported
 */
export function getBlendModeCSSValue(mode: BlendModeType): string {
  const definition = getBlendModeDefinition(mode);
  return definition?.cssValue ?? 'normal';
}

/**
 * Check if blend mode is supported by CSS
 * 检查混合模式是否被 CSS 支持
 */
export function isBlendModeCSSSupported(mode: BlendModeType): boolean {
  const definition = getBlendModeDefinition(mode);
  return !!definition?.cssValue;
}

/**
 * Blend mode category i18n keys
 * 混合模式分类的国际化键
 */
export const BLEND_MODE_CATEGORY_I18N_KEYS: Record<BlendModeCategory, string> = {
  normal: 'blendMode.category.normal',
  darken: 'blendMode.category.darken',
  lighten: 'blendMode.category.lighten',
  contrast: 'blendMode.category.contrast',
  inversion: 'blendMode.category.inversion',
  component: 'blendMode.category.component',
};

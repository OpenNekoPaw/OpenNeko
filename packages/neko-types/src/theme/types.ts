/**
 * Theme Module - Type Definitions
 *
 * Layer 0: Zero dependencies, works in any environment.
 */

/**
 * Theme kind (matches VSCode ColorThemeKind values)
 */
export type ThemeKind = 'light' | 'dark' | 'high-contrast' | 'high-contrast-light';

/**
 * Theme info available to all layers
 */
export interface IThemeInfo {
  readonly kind: ThemeKind;
}

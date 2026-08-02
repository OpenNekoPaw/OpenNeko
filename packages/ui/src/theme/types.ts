/**
 * Theme Module - Type Definitions
 *
 * Layer 0: Zero dependencies, works in any environment.
 */

/**
 * Theme kind shared by Desktop creative surfaces.
 */
export type ThemeKind = 'light' | 'dark' | 'high-contrast' | 'high-contrast-light';

/**
 * Theme info available to all layers
 */
export interface IThemeInfo {
  readonly kind: ThemeKind;
}

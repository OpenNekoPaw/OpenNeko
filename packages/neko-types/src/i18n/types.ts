/**
 * i18n Module - Type Definitions
 *
 * Core abstractions for internationalization across all packages.
 * Layer 0: Zero dependencies, works in any environment.
 */

/**
 * Supported locales
 */
export type SupportedLocale = 'en' | 'zh-cn';

/**
 * Message bundle - flat key-value mapping
 *
 * Design decision: flat key structure (dot-separated) over nested objects.
 * Reasons:
 * 1. Consistent with VSCode l10n bundle.l10n.json format
 * 2. Easier to achieve type safety (string literal union)
 * 3. Simpler lookup logic (no recursive resolution)
 *
 * Example:
 * ```typescript
 * const en: MessageBundle = {
 *   'toolbar.save': 'Save',
 *   'toolbar.undo': 'Undo',
 *   'status.zoom': 'Zoom: {level}%',
 * };
 * ```
 */
export type MessageBundle = Record<string, string>;

/**
 * i18n service interface
 */
export interface II18nService {
  /** Current locale */
  readonly locale: SupportedLocale;

  /**
   * Translate a message key
   * @param key - dot-separated key (e.g., 'toolbar.save')
   * @param params - interpolation params (e.g., { level: 100 })
   * @returns Translated string, or the key itself as fallback
   */
  t(key: string, params?: Record<string, string | number>): string;

  /** Change locale at runtime */
  setLocale(locale: SupportedLocale): void;

  /**
   * Register a message bundle for a namespace + locale
   * @param namespace - package identifier (e.g., 'cut', 'agent')
   * @param locale - target locale
   * @param bundle - flat key-value translations
   */
  registerBundle(namespace: string, locale: SupportedLocale, bundle: MessageBundle): void;

  /** Listen for locale changes */
  onLocaleChange(callback: (locale: SupportedLocale) => void): void;
}

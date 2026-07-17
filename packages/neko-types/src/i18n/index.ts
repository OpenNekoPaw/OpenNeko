/**
 * i18n Module
 *
 * Unified internationalization for all OpenNeko packages.
 *
 * Layer 0 (this module): II18nService interface + I18nService default implementation
 * Layer 1 (vscode/extension/i18n-bridge): VSCode locale detection for Extension Host
 * Layer 2 (i18n/webview): detectWebviewLocale() — requires DOM
 * Layer 2 (i18n/react): I18nProvider + useI18n + useTranslation — requires React
 *
 * Each webview package creates an I18nService instance, registers namespaced bundles,
 * and wraps its React tree with <I18nProvider service={i18nService}>.
 *
 * NOTE: DOM/React dependencies are NOT exported here.
 * Import from '@neko/shared/i18n/webview' or '@neko/shared/i18n/react' respectively.
 */
export type { II18nService, MessageBundle, SupportedLocale } from './types';
export { I18nService, interpolate, normalizeLocale } from './core';
export { createStrictTranslator } from './strict';
export type {
  StrictMessageBundleSource,
  StrictMessageKey,
  StrictMessageParameters,
  StrictTranslator,
} from './strict';

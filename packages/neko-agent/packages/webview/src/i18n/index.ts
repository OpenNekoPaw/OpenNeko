/**
 * i18n setup for neko-agent webview
 *
 * Uses shared I18nService from @neko/shared with Model B namespacing.
 * Each top-level translation category is registered as a separate namespace.
 * Components continue using t('dotted.key') unchanged.
 */
import { createWebviewI18n } from '@neko/shared/i18n/webview';
import type { SupportedLocale } from '@neko/shared';

import { bundles as enBundles } from './locales/en';
import { bundles as zhCnBundles } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: enBundles,
    'zh-cn': zhCnBundles,
  },
});

export const { i18nService } = webviewI18n;

/**
 * Translate a message key with optional named parameters
 */
export function t(key: string, params?: Record<string, string | number>): string {
  return webviewI18n.t(key, params);
}

/**
 * Change locale at runtime
 */
export function setLocale(locale: SupportedLocale): void {
  webviewI18n.setLocale(locale);
}

/**
 * Get current locale
 */
export function getLocale(): SupportedLocale {
  return webviewI18n.getLocale();
}

/**
 * Detect locale from webview DOM attribute
 */
export function detectLocale(): SupportedLocale {
  return webviewI18n.detectLocale();
}

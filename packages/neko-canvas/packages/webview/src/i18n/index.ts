/**
 * i18n setup for neko-canvas webview
 *
 * Uses shared I18nService from @neko/shared.
 * Canvas has a single namespace with all keys in one flat bundle.
 */
import { createWebviewI18n } from '@neko/shared/i18n/webview';
import type { SupportedLocale } from '@neko/shared';

import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: { canvas: en },
    'zh-cn': { canvas: zhCN },
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

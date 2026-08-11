/**
 * i18n setup for neko-preview webview
 *
 * Uses shared I18nService from @neko/shared with Model B namespacing.
 * Registers 'preview' namespace for video and audio player strings.
 */
import { createWebviewI18n } from '@neko/ui/i18n/webview';
import type { II18nService } from '@neko/ui/i18n';
import type { SupportedLocale } from '@neko/ui/i18n';

import { bundles as enBundles } from './locales/en';
import { bundles as zhCnBundles } from './locales/zh-cn';

const webviewI18n = createWebviewI18n({
  bundles: {
    en: enBundles,
    'zh-cn': zhCnBundles,
  },
});

export function createPreviewI18nService(locale: SupportedLocale): II18nService {
  return createWebviewI18n({
    initialLocale: locale,
    bundles: {
      en: enBundles,
      'zh-cn': zhCnBundles,
    },
  }).i18nService;
}

export const { i18nService } = webviewI18n;

/** Translate a message key with optional named parameters */
export function t(key: string, params?: Record<string, string | number>): string {
  return webviewI18n.t(key, params);
}

/** Change locale at runtime */
export function setLocale(locale: SupportedLocale): void {
  webviewI18n.setLocale(locale);
}

/**
 * i18n for neko-assets extension
 */

import { I18nService } from '@neko/shared';
import type { SupportedLocale } from '@neko/shared';
import { en } from './locales/en';
import { zhCn } from './locales/zh-cn';

/**
 * Global i18n service instance for neko-assets
 */
let i18nService: I18nService | null = null;

/**
 * Initialize i18n service with VSCode locale
 */
export function initI18n(locale: SupportedLocale): I18nService {
  i18nService = new I18nService(locale);

  // Register translation bundles
  i18nService.registerBundle('assets', 'en', en);
  i18nService.registerBundle('assets', 'zh-cn', zhCn);

  return i18nService;
}

/**
 * Get the global i18n service instance
 */
function getI18n(): I18nService {
  if (!i18nService) {
    throw new Error('i18n service not initialized. Call initI18n() first.');
  }
  return i18nService;
}

/**
 * Translate a key with optional parameters
 */
export function t(key: string, params?: Record<string, string | number>): string {
  return getI18n().t(key, params);
}

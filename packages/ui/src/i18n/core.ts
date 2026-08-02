/**
 * i18n Core - Default implementation
 *
 * Provides locale normalization, string interpolation, and a
 * registry-based i18n service.
 * Layer 0: Zero dependencies.
 */

import type { II18nService, MessageBundle, SupportedLocale } from './types';

/**
 * Normalize a raw locale string to SupportedLocale
 *
 * Handles variants: 'zh-Hans', 'zh_CN', 'zh-TW', 'en-US', 'en-GB', etc.
 */
export function normalizeLocale(raw: string): SupportedLocale {
  const lower = raw.toLowerCase().replace('_', '-');
  if (lower.startsWith('zh')) return 'zh-cn';
  return 'en';
}

/**
 * Interpolate parameters into a message template
 *
 * Supports named params: "Hello {name}" + { name: 'World' } → "Hello World"
 * Supports positional params: "Zoom: {0}%" + { '0': 100 } → "Zoom: 100%"
 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Default i18n service implementation
 *
 * Usage:
 * ```typescript
 * const i18n = new I18nService('en');
 * i18n.registerBundle('cut', 'en', { 'toolbar.save': 'Save' });
 * i18n.registerBundle('cut', 'zh-cn', { 'toolbar.save': '保存' });
 * i18n.t('toolbar.save'); // 'Save'
 * i18n.setLocale('zh-cn');
 * i18n.t('toolbar.save'); // '保存'
 * ```
 */
export class I18nService implements II18nService {
  private _locale: SupportedLocale;
  private readonly defaultLocale: SupportedLocale;
  /** namespace -> locale -> bundle */
  private readonly bundles = new Map<string, Map<SupportedLocale, MessageBundle>>();
  private readonly listeners: Array<(locale: SupportedLocale) => void> = [];

  constructor(initialLocale: SupportedLocale = 'en', defaultLocale: SupportedLocale = 'en') {
    this._locale = initialLocale;
    this.defaultLocale = defaultLocale;
  }

  get locale(): SupportedLocale {
    return this._locale;
  }

  registerBundle(namespace: string, locale: SupportedLocale, bundle: MessageBundle): void {
    let localeMap = this.bundles.get(namespace);
    if (!localeMap) {
      localeMap = new Map();
      this.bundles.set(namespace, localeMap);
    }
    localeMap.set(locale, bundle);
  }

  t(key: string, params?: Record<string, string | number>): string {
    // Try current locale first, then the service default locale.
    const localesToTry = [this._locale, this.defaultLocale];
    for (const locale of localesToTry) {
      const result = this.findInBundles(key, locale);
      if (result !== undefined) {
        return interpolate(result, params);
      }
    }
    // Return key itself as last resort
    return key;
  }

  private findInBundles(key: string, locale: SupportedLocale): string | undefined {
    let result: string | undefined;
    this.bundles.forEach((localeMap) => {
      if (result !== undefined) return;
      const bundle = localeMap.get(locale);
      if (bundle && key in bundle) {
        result = bundle[key];
      }
    });
    return result;
  }

  setLocale(locale: SupportedLocale): void {
    if (this._locale === locale) return;
    this._locale = locale;
    for (const cb of this.listeners) {
      cb(locale);
    }
  }

  onLocaleChange(callback: (locale: SupportedLocale) => void): void {
    this.listeners.push(callback);
  }
}

/**
 * i18n Webview Utilities
 *
 * Browser/DOM-dependent utilities for webview locale detection.
 * Import via: @neko/shared/i18n/webview (only in webview context)
 *
 * NOT exported from the main @neko/shared entry to avoid
 * requiring DOM types in Node.js consumers.
 */

import { I18nService, normalizeLocale } from './core';
import type { II18nService, MessageBundle, SupportedLocale } from './types';

/**
 * Detect locale from a VSCode webview's DOM attribute
 *
 * VSCode injects `data-vscode-locale` on the <html> element.
 * Returns 'en' if attribute is missing or not in browser context.
 *
 * Usage in webview:
 * ```typescript
 * import { detectWebviewLocale } from '@neko/shared/i18n/webview';
 * const locale = detectWebviewLocale();
 * ```
 */
export function detectWebviewLocale(): SupportedLocale {
  if (typeof document === 'undefined') return 'en';
  const attr = document.documentElement.getAttribute('data-vscode-locale');
  return attr ? normalizeLocale(attr) : 'en';
}

export type WebviewI18nBundleMap = Partial<Record<SupportedLocale, Record<string, MessageBundle>>>;

export interface CreateWebviewI18nOptions {
  readonly bundles: WebviewI18nBundleMap;
  readonly initialLocale?: SupportedLocale;
  readonly defaultLocale?: SupportedLocale;
  readonly detectLocale?: () => SupportedLocale;
  readonly service?: II18nService;
}

export interface WebviewI18nAdapter {
  readonly i18nService: II18nService;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly setLocale: (locale: SupportedLocale) => void;
  readonly getLocale: () => SupportedLocale;
  readonly detectLocale: () => SupportedLocale;
}

export function createWebviewI18n(options: CreateWebviewI18nOptions): WebviewI18nAdapter {
  const detectLocale = options.detectLocale ?? detectWebviewLocale;
  const initialLocale = options.initialLocale ?? detectLocale();
  const service = options.service ?? new I18nService(initialLocale, options.defaultLocale ?? 'en');

  registerWebviewI18nBundles(service, options.bundles);

  return {
    i18nService: service,
    t: (key, params) => service.t(key, params),
    setLocale: (locale) => service.setLocale(locale),
    getLocale: () => service.locale,
    detectLocale,
  };
}

export function registerWebviewI18nBundles(
  service: II18nService,
  bundles: WebviewI18nBundleMap,
): void {
  const entries = Object.entries(bundles) as Array<
    [SupportedLocale, Record<string, MessageBundle> | undefined]
  >;

  for (const [locale, namespaceBundles] of entries) {
    if (!namespaceBundles) {
      continue;
    }
    for (const [namespace, bundle] of Object.entries(namespaceBundles)) {
      service.registerBundle(namespace, locale, bundle);
    }
  }
}

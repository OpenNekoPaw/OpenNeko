import { normalizeLocale, type SupportedLocale } from '@neko/ui/i18n';
import { createWebviewI18n } from '@neko/ui/i18n/webview';
import { en } from './locales/en';
import { zhCN } from './locales/zh-cn';
import type { DesktopLocalePreference } from '@neko/host/application-settings';

export function createDesktopI18n(locale: SupportedLocale) {
  return createWebviewI18n({
    initialLocale: locale,
    defaultLocale: 'en',
    bundles: {
      en: { desktop: en },
      'zh-cn': { desktop: zhCN },
    },
  });
}

export function detectDesktopLocale(
  source: Pick<Navigator, 'language' | 'languages'> = navigator,
): SupportedLocale {
  return normalizeLocale(source.languages[0] ?? source.language);
}

export function applyDesktopLocale(target: Document, locale: SupportedLocale): void {
  target.documentElement.lang = locale === 'zh-cn' ? 'zh-CN' : 'en';
  target.documentElement.dataset.nekoLocale = locale;
}

export function resolveDesktopLocalePreference(
  preference: DesktopLocalePreference,
  source: Pick<Navigator, 'language' | 'languages'> = navigator,
): SupportedLocale {
  return preference === 'system' ? detectDesktopLocale(source) : preference;
}

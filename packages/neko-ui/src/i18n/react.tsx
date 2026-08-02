/**
 * i18n React Bindings
 *
 * React Provider + hooks wrapping II18nService for webview context.
 * Layer 2: Depends on React.
 *
 * Import via: @neko/ui/i18n/react
 *
 * NOT exported from the main @neko/shared entry to avoid
 * requiring React/DOM types in Node.js consumers.
 */

import { createElement, createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { II18nService, SupportedLocale } from './index';

interface I18nContextValue {
  readonly locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  /** An initialized II18nService instance (with bundles already registered) */
  service: II18nService;
}

/**
 * I18n Provider component
 *
 * Wraps an II18nService instance and provides `t()` to the component tree.
 * Locale changes flow through the injected service owned by Desktop composition.
 *
 * Usage:
 * ```tsx
 * import { I18nProvider } from '@neko/ui/i18n/react';
 * import { i18nService } from './i18n';
 *
 * <I18nProvider service={i18nService}>
 *   <App />
 * </I18nProvider>
 * ```
 */
export function I18nProvider({ children, service }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(service.locale);

  // Sync React state when locale changes on the service (from any source)
  useEffect(() => {
    service.onLocaleChange((newLocale) => {
      setLocaleState(newLocale);
    });
  }, [service]);

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      service.setLocale(newLocale);
    },
    [service],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => service.t(key, params),
    // Re-create t when locale changes so consuming components re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service, locale],
  );

  return createElement(I18nContext.Provider, { value: { locale, setLocale, t } }, children);
}

/**
 * Hook to access the full i18n context (locale, setLocale, t)
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * Hook to get translation function and current locale
 *
 * Most commonly used hook:
 * ```tsx
 * const { t, locale } = useTranslation();
 * ```
 */
export function useTranslation() {
  const { t, locale } = useI18n();
  return { t, locale };
}

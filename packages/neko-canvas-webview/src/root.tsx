import { useEffect, type ReactElement } from 'react';
import { CanvasApp } from './CanvasApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import type { SupportedLocale } from '@neko/shared';
import '@neko/ui/keyboard/focus.css';
import './index.css';

export interface CanvasWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export function CanvasWebviewRoot({ locale }: CanvasWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <I18nProvider service={i18nService}>
      <ErrorBoundary>
        <CanvasApp />
      </ErrorBoundary>
    </I18nProvider>
  );
}

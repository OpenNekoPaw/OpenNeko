import { useEffect, type ReactElement } from 'react';
import type { SupportedLocale } from '@neko/shared';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import { CutPresentationStoreProvider } from './stores/cut-presentation-store';
import { CutOtioControllerProvider } from './controllers/CutOtioControllerContext';
import '@neko/ui/keyboard/focus.css';
import '@neko/ui/workbench/editor-workbench.css';
import './index.css';

export interface CutWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export function CutWebviewRoot({ locale }: CutWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <ErrorBoundary>
      <I18nProvider service={i18nService}>
        <ToastProvider>
          <CutPresentationStoreProvider>
            <CutOtioControllerProvider>
              <App />
            </CutOtioControllerProvider>
          </CutPresentationStoreProvider>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

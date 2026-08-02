import { useEffect, type ReactElement } from 'react';
import type { SupportedLocale } from '@neko/ui/i18n';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import { CutPresentationStoreProvider } from './stores/cut-presentation-store';
import { CutOtioControllerProvider } from './controllers/CutOtioControllerContext';
import {
  CutWebviewHostBridgeProvider,
  type CutWebviewHostBridge,
} from './controllers/CutWebviewHostBridgeContext';
import '@neko/ui/keyboard/focus.css';
import '@neko/ui/workbench/editor-workbench.css';
import './index.css';

export interface CutWebviewRootProps {
  readonly locale?: SupportedLocale;
  readonly bridge: CutWebviewHostBridge;
  readonly presentation?: 'editor' | 'timeline-only';
  readonly timelineTarget?: Element;
}

export function CutWebviewRoot({
  bridge,
  locale,
  presentation,
  timelineTarget,
}: CutWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <div className="cut-webview-root">
      <I18nProvider service={i18nService}>
        <ErrorBoundary>
          <ToastProvider>
            <CutPresentationStoreProvider>
              <CutWebviewHostBridgeProvider bridge={bridge}>
                <CutOtioControllerProvider>
                  <App presentation={presentation} timelineTarget={timelineTarget} />
                </CutOtioControllerProvider>
              </CutWebviewHostBridgeProvider>
            </CutPresentationStoreProvider>
          </ToastProvider>
        </ErrorBoundary>
      </I18nProvider>
    </div>
  );
}

export type { CutWebviewHostBridge } from './controllers/CutWebviewHostBridgeContext';

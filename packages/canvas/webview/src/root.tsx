import { useEffect, type ReactElement } from 'react';
import { CanvasApp } from './CanvasApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import type { SupportedLocale } from '@neko/ui/i18n';
import { CanvasHostProvider, type CanvasWebviewHostPort } from './host-runtime';
import { CanvasStoreScopeProvider } from './stores/canvasStoreScope';
import '@neko/ui/keyboard/focus.css';
import './index.css';

export interface CanvasWebviewRootProps {
  readonly locale?: SupportedLocale;
  readonly host: CanvasWebviewHostPort;
  readonly lifecyclePresentation?: 'active' | 'suspended';
}

export function CanvasWebviewRoot({
  host,
  lifecyclePresentation = 'active',
  locale,
}: CanvasWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <div
      className="canvas-webview-root"
      data-canvas-webview-root="true"
      data-lifecycle-presentation={lifecyclePresentation}
    >
      <I18nProvider service={i18nService}>
        <CanvasHostProvider host={host}>
          <CanvasStoreScopeProvider operationPort={host}>
            {lifecyclePresentation === 'active' ? (
              <ErrorBoundary>
                <CanvasApp host={host} />
              </ErrorBoundary>
            ) : (
              <div data-canvas-suspended="true" hidden />
            )}
          </CanvasStoreScopeProvider>
        </CanvasHostProvider>
      </I18nProvider>
    </div>
  );
}

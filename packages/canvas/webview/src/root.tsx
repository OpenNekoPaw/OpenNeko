import { useEffect, useMemo, type ReactElement } from 'react';
import { CanvasApp } from './CanvasApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService, setLocale } from './i18n';
import type { SupportedLocale } from '@neko/ui/i18n';
import {
  CanvasHostProvider,
  createCanvasWebviewHost,
  type CanvasWebviewDelegate,
  type CanvasHostRuntime,
} from './host-runtime';
import { CanvasStoreScopeProvider } from './stores/canvasStoreScope';
import '@neko/ui/keyboard/focus.css';
import './index.css';

export interface CanvasWebviewRootProps {
  readonly locale?: SupportedLocale;
  readonly runtime: CanvasHostRuntime;
  readonly delegate?: CanvasWebviewDelegate;
}

export function CanvasWebviewRoot({
  delegate,
  locale,
  runtime,
}: CanvasWebviewRootProps): ReactElement {
  const host = useMemo(() => createCanvasWebviewHost(runtime, delegate), [delegate, runtime]);
  const hostLifetime = useMemo(() => ({ mounted: false }), [host]);
  useEffect(() => {
    hostLifetime.mounted = true;
    return () => {
      hostLifetime.mounted = false;
      // React runs a deleted parent's passive cleanup before its children. Defer ownership
      // release until CanvasApp and its Preview resolvers have unsubscribed from this Host.
      // StrictMode may reactivate the same Host before this microtask runs.
      queueMicrotask(() => {
        if (!hostLifetime.mounted) host.dispose();
      });
    };
  }, [host, hostLifetime]);
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return (
    <div className="canvas-webview-root" data-canvas-webview-root="true">
      <I18nProvider service={i18nService}>
        <CanvasHostProvider host={host}>
          <CanvasStoreScopeProvider operationPort={host}>
            <ErrorBoundary>
              <CanvasApp host={host} />
            </ErrorBoundary>
          </CanvasStoreScopeProvider>
        </CanvasHostProvider>
      </I18nProvider>
    </div>
  );
}

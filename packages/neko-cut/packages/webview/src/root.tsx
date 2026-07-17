import { useEffect, type ReactElement } from 'react';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { i18nService, setLocale } from './i18n';
import { useEditorStore } from './stores/editor-store';
import type { ProjectData } from './types';
import type { SupportedLocale } from '@neko/shared';
import '@neko/ui/keyboard/focus.css';
import './index.css';

export interface CutWebviewRootProps {
  readonly initialProject?: ProjectData;
  readonly projectRoot?: string;
  readonly locale?: SupportedLocale;
}

export function CutWebviewRoot({
  initialProject,
  locale,
  projectRoot,
}: CutWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  useEffect(() => {
    if (initialProject) {
      useEditorStore.getState().setProject(initialProject, projectRoot);
    }
  }, [initialProject, projectRoot]);

  return (
    <ErrorBoundary>
      <I18nProvider service={i18nService}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}

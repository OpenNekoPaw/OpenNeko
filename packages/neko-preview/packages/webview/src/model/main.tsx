import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import './model.css';

function ModelPreviewBootstrap(): React.JSX.Element {
  return (
    <main className="model-preview-bootstrap" aria-live="polite">
      <p>Waiting for the authorized model source…</p>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <I18nProvider service={i18nService}>
        <ErrorBoundary>
          <ModelPreviewBootstrap />
        </ErrorBoundary>
      </I18nProvider>
    </React.StrictMode>,
  );
}

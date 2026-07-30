import React from 'react';
import ReactDOM from 'react-dom/client';
import { PdfViewer } from './PdfViewer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import '../styles/player.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <I18nProvider service={i18nService}>
        <ErrorBoundary>
          <PdfViewer />
        </ErrorBoundary>
      </I18nProvider>
    </React.StrictMode>,
  );
}

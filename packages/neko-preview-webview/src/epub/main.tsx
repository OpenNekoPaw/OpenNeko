import React from 'react';
import ReactDOM from 'react-dom/client';
import { EpubViewer } from './EpubViewer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import '../styles/player.css';

// epubjs calls querySelectorAll(...).map(...) but NodeList lacks .map in Chromium.
// Polyfill before epubjs initializes to fix the "e.map is not a function" error.
if (typeof NodeList !== 'undefined' && !('map' in NodeList.prototype)) {
  (NodeList.prototype as unknown as Record<string, unknown>)['map'] = Array.prototype.map;
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <I18nProvider service={i18nService}>
        <ErrorBoundary>
          <EpubViewer />
        </ErrorBoundary>
      </I18nProvider>
    </React.StrictMode>,
  );
}

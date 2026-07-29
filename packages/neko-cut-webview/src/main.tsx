import React from 'react';
import ReactDOM from 'react-dom/client';
import { CutWebviewRoot } from './root';
import { getLogger } from '@/utils/logger';

const logger = getLogger('NekoSuite');

try {
  const rootElement = document.getElementById('root');

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <CutWebviewRoot />
      </React.StrictMode>,
    );
  } else {
    logger.error('Root element not found!');
  }
} catch (error) {
  logger.error('Error rendering app:', error);
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopApplication } from './DesktopShell';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('OpenNeko Desktop renderer root is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <DesktopApplication />
  </StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { CanvasWebviewRoot } from './root';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CanvasWebviewRoot />
  </React.StrictMode>,
);

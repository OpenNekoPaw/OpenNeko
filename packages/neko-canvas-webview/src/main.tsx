import React from 'react';
import ReactDOM from 'react-dom/client';
import { CanvasWebviewRoot } from './root';
import { createVscodeCanvasHostRuntime } from './host-runtime';
import { getVSCodeAPI } from '@neko/shared/vscode';

document.documentElement.classList.add('canvas-webview-document');

const runtime = createVscodeCanvasHostRuntime();
const delegate = getVSCodeAPI();
if (!delegate) throw new Error('Canvas VS Code Webview API is unavailable.');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CanvasWebviewRoot runtime={runtime} delegate={delegate} />
  </React.StrictMode>,
);

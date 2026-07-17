import React from 'react';
import ReactDOM from 'react-dom/client';
import { AgentWebviewRoot } from './root';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AgentWebviewRoot />
  </React.StrictMode>,
);

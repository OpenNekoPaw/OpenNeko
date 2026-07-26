import React from 'react';
import ReactDOM from 'react-dom/client';
import { PanoramaViewer } from '../panorama/PanoramaViewer';
import '../panorama/panorama.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <PanoramaViewer kind="image" />
    </React.StrictMode>,
  );
}

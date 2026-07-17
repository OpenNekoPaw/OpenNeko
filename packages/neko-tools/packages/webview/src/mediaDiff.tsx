import React from 'react';
import ReactDOM from 'react-dom/client';
import MediaDiffApp from './components/MediaDiff/MediaDiffApp';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import {
  MediaDiffRuntimeProvider,
  type IMediaDiffRuntime,
} from './runtime/MediaDiffRuntimeContext';
import { getDefaultAudioContextFactory } from './runtime/audioContextFactory';
import { createBlobUrlRegistry } from './runtime/blobUrlRegistry';
import { getWebviewBridge } from './runtime/bridge';
import { getMediaDiffInitialState } from './runtime/initialState';
import { getDefaultRafScheduler } from './runtime/rafScheduler';
import { getDefaultMediaDiffStreamClientFactory } from './runtime/streamClientFactory';
import './styles/index.css';

const bridge = getWebviewBridge();
const runtime: IMediaDiffRuntime = {
  bridge,
  initialState: getMediaDiffInitialState(bridge),
  audioContextFactory: getDefaultAudioContextFactory(),
  blobUrlRegistry: createBlobUrlRegistry(),
  rafScheduler: getDefaultRafScheduler(),
  streamClientFactory: getDefaultMediaDiffStreamClientFactory(),
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <MediaDiffRuntimeProvider runtime={runtime}>
        <I18nProvider service={i18nService}>
          <MediaDiffApp />
        </I18nProvider>
      </MediaDiffRuntimeProvider>
    </React.StrictMode>,
  );
}

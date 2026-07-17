import React from 'react';
import ReactDOM from 'react-dom/client';
import AssetDiffApp from './components/AssetDiff/AssetDiffApp';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import {
  AssetDiffRuntimeProvider,
  type IAssetDiffRuntime,
} from './runtime/AssetDiffRuntimeContext';
import { getWebviewBridge } from './runtime/bridge';
import { getAssetDiffInitialState } from './runtime/assetDiffInitialState';
import './styles/index.css';

const bridge = getWebviewBridge();
const runtime: IAssetDiffRuntime = {
  bridge,
  initialState: getAssetDiffInitialState(bridge),
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <AssetDiffRuntimeProvider runtime={runtime}>
        <I18nProvider service={i18nService}>
          <AssetDiffApp />
        </I18nProvider>
      </AssetDiffRuntimeProvider>
    </React.StrictMode>,
  );
}

import { getVscodeApi } from '../shared/vscodeApi';
import type { ModelViewerHostPort } from './modelViewerHost';

export function createVscodeModelViewerHost(): ModelViewerHostPort {
  const vscode = getVscodeApi();
  return {
    postMessage(message) {
      vscode.postMessage(message);
    },
    getState() {
      return vscode.getState();
    },
    setState(state) {
      vscode.setState(state);
    },
    subscribe(listener) {
      const onMessage = (event: MessageEvent<unknown>): void => listener(event.data);
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    },
  };
}

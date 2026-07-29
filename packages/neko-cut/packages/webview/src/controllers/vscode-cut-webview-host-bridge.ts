import { postMessage } from '@neko/shared/vscode';
import type { CutWebviewHostBridge } from './CutWebviewHostBridgeContext';

export function createVSCodeCutWebviewHostBridge(): CutWebviewHostBridge {
  return {
    postIntent: (intent) => {
      postMessage(intent);
    },
    subscribe: (listener) => {
      const receive = (event: MessageEvent<unknown>) => {
        listener(event.data);
      };
      window.addEventListener('message', receive);
      return () => window.removeEventListener('message', receive);
    },
  };
}

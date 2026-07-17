/**
 * VSCode Webview messaging hook
 *
 * Provides type-safe postMessage communication with the Extension Host.
 */

import { useEffect, useCallback, useRef } from 'react';
import type { WebviewMessage, ExtensionMessage } from './types';
import { getVscodeApi } from './vscodeApi';

/**
 * Send a message to the Extension Host
 */
export function postMessage(message: WebviewMessage): void {
  getVscodeApi().postMessage(message);
}

/**
 * Hook to listen for messages from the Extension Host
 */
export function useExtensionMessage(handler: (message: ExtensionMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;
      if (message && typeof message.type === 'string') {
        handlerRef.current(message);
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}

/**
 * Hook that sends 'ready' on mount and provides postMessage
 */
export function useVscodeReady(): {
  postMessage: (message: WebviewMessage) => void;
} {
  const post = useCallback((message: WebviewMessage) => {
    postMessage(message);
  }, []);

  useEffect(() => {
    postMessage({ type: 'ready' });
  }, []);

  return { postMessage: post };
}

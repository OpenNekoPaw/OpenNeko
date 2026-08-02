/** Typed window messaging for embeddable preview viewers. */

import { useEffect, useCallback, useRef } from 'react';
import type { WebviewMessage, HostMessage, ReadyMessage } from './types';
import { getBrowserHostState } from './browserHostState';

/**
 * Send a message to the Desktop host.
 */
export function postMessage(message: WebviewMessage): void {
  getBrowserHostState().postMessage(message);
}

/**
 * Listen for messages from the Desktop host.
 */
export function useHostMessage(handler: (message: HostMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data as HostMessage;
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
export function useHostReady(readyMessage: ReadyMessage = { type: 'ready' }): {
  postMessage: (message: WebviewMessage) => void;
} {
  const readyMessageRef = useRef(readyMessage);
  const post = useCallback((message: WebviewMessage) => {
    postMessage(message);
  }, []);

  useEffect(() => {
    postMessage(readyMessageRef.current);
  }, []);

  return { postMessage: post };
}

/** Typed window messaging for embeddable preview viewers. */

import { useEffect, useRef } from 'react';
import type { WebviewMessage, HostMessage } from './types';
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

/**
 * VSCode Webview API Wrapper
 *
 * Provides centralized, type-safe access to VSCode Webview API.
 * Includes singleton pattern, request-response pattern, and state management.
 *
 * This module is designed to be used in browser context (webview).
 * It will gracefully handle non-VSCode environments (development mode).
 */

import type {
  VSCodeAPI,
  RequestMessage,
  PendingRequest,
  SendRequestOptions,
  IVSCodeApiWrapper,
} from './types';

// Default timeout for requests (10 seconds)
const DEFAULT_REQUEST_TIMEOUT = 10000;

// Singleton instance
let cachedApi: VSCodeAPI | null = null;
let initialized = false;

// Request-response tracking
const pendingRequests = new Map<string, PendingRequest>();
let messageListenerInitialized = false;
let messageListener: ((event: MessageEvent) => void) | null = null;

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Initialize message listener for request-response pattern
 */
function initMessageListener(): void {
  if (messageListenerInitialized) return;
  if (typeof window === 'undefined') return;

  messageListenerInitialized = true;

  messageListener = (event: MessageEvent) => {
    const message = event.data;

    // Check if this is a response to a pending request
    if (message && message._requestId && pendingRequests.has(message._requestId)) {
      const pending = pendingRequests.get(message._requestId)!;
      pendingRequests.delete(message._requestId);
      clearTimeout(pending.timeout);

      if (message._error) {
        pending.reject(new Error(message._error));
      } else {
        // Resolve with payload if present, otherwise the whole message
        pending.resolve(message.payload !== undefined ? message.payload : message);
      }
    }
  };

  window.addEventListener('message', messageListener);
}

/**
 * Get VSCode API instance (singleton)
 * Returns null when running outside VSCode context (development mode)
 *
 * IMPORTANT: The VSCode API must be pre-acquired in the HTML template
 * before any modules load, and stored on window.vscodeApi.
 * acquireVsCodeApi() can only be called ONCE per webview.
 *
 * Example in HTML template:
 * ```html
 * <script>window.vscodeApi = acquireVsCodeApi();</script>
 * ```
 */
export function getVSCodeAPI(): VSCodeAPI | null {
  if (initialized) {
    return cachedApi;
  }

  initialized = true;

  // Check if running in browser
  if (typeof window === 'undefined') {
    return null;
  }

  // Check if API was pre-acquired and stored on window
  const windowWithApi = window as unknown as { vscodeApi?: VSCodeAPI };
  if (windowWithApi.vscodeApi) {
    cachedApi = windowWithApi.vscodeApi;
    return cachedApi;
  }

  // Try to acquire directly (fallback, may fail if already acquired)
  try {
    const acquireVsCodeApi = (window as unknown as { acquireVsCodeApi?: () => VSCodeAPI })
      .acquireVsCodeApi;
    if (typeof acquireVsCodeApi === 'function') {
      cachedApi = acquireVsCodeApi();
      return cachedApi;
    }
  } catch {
    // Ignore - not in VSCode context
  }

  // Not in VSCode context (development mode)
  return null;
}

/**
 * Check if running in VSCode webview context
 */
export function isVSCodeContext(): boolean {
  return getVSCodeAPI() !== null;
}

/**
 * Send message to Extension Host
 * Safe to call even when not in VSCode context (no-op in dev mode)
 */
export function postMessage(message: unknown): void {
  const api = getVSCodeAPI();
  if (api) {
    api.postMessage(message);
  }
}

/**
 * Get persisted state from VSCode
 */
export function getState<T>(): T | undefined {
  const api = getVSCodeAPI();
  if (api) {
    return api.getState() as T | undefined;
  }
  return undefined;
}

/**
 * Set persisted state in VSCode
 */
export function setState<T>(state: T): void {
  const api = getVSCodeAPI();
  if (api) {
    api.setState(state);
  }
}

/**
 * Send a request and wait for response from Extension Host
 * Uses Promise-based pattern with automatic timeout
 *
 * @param message - Message to send (type and payload)
 * @param options - Request options (timeout)
 * @returns Promise that resolves with the response or rejects on timeout/error
 *
 * @example
 * ```typescript
 * const response = await sendRequest({ type: 'getFileInfo', path: '/some/file' });
 * console.log(response.size, response.mtime);
 * ```
 *
 * Note: Extension Host must respond with the same _requestId:
 * ```typescript
 * // In Extension Host:
 * panel.webview.postMessage({
 *   type: 'getFileInfoResponse',
 *   _requestId: message._requestId,
 *   payload: { size: stat.size, mtime: stat.mtime },
 * });
 * ```
 */
export function sendRequest<TResponse = unknown>(
  message: Omit<RequestMessage, '_requestId'>,
  options?: SendRequestOptions,
): Promise<TResponse> {
  // Initialize listener on first request
  initMessageListener();

  const api = getVSCodeAPI();
  if (!api) {
    // In dev mode, simulate a timeout
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Not in VSCode context'));
      }, 100);
    });
  }

  const timeout = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT;

  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timeout: ${message.type}`));
    }, timeout);

    // Store pending request
    pendingRequests.set(requestId, {
      resolve: resolve as (response: unknown) => void,
      reject,
      timeout: timeoutHandle,
    });

    // Send message with request ID
    api.postMessage({
      ...message,
      _requestId: requestId,
    });
  });
}

/**
 * Cancel a pending request
 */
export function cancelRequest(requestId: string): boolean {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Request cancelled'));
    pendingRequests.delete(requestId);
    return true;
  }
  return false;
}

/**
 * Get count of pending requests (useful for debugging)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Reset the module state (for testing)
 */
export function resetVSCodeApi(): void {
  if (messageListener && typeof window !== 'undefined') {
    window.removeEventListener('message', messageListener);
  }
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timeout);
  }
  cachedApi = null;
  initialized = false;
  messageListener = null;
  pendingRequests.clear();
  messageListenerInitialized = false;
}

/**
 * VSCode API wrapper object
 * Provides all functions as a single object for convenience
 */
export const vscodeApi: IVSCodeApiWrapper = {
  get: getVSCodeAPI,
  isVSCodeContext,
  postMessage,
  getState,
  setState,
  sendRequest,
  cancelRequest,
  getPendingRequestCount,
};

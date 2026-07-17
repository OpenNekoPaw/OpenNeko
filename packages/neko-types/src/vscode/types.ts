/**
 * VSCode Webview API Types
 *
 * Type definitions for VSCode Webview API communication.
 * Used by both assistant and webview packages.
 */

/**
 * VSCode API interface provided by acquireVsCodeApi()
 */
export interface VSCodeAPI {
  postMessage(message: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}

/**
 * Request message with tracking ID for request-response pattern
 */
export interface RequestMessage {
  type: string;
  _requestId: string;
  [key: string]: unknown;
}

/**
 * VSCode response message with tracking ID
 */
export interface VSCodeResponseMessage {
  type: string;
  _requestId: string;
  _error?: string;
  payload?: unknown;
  [key: string]: unknown;
}

/**
 * Pending request tracking
 */
export interface PendingRequest<T = unknown> {
  resolve: (response: T) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Options for sendRequest
 */
export interface SendRequestOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * VSCode API wrapper interface
 */
export interface IVSCodeApiWrapper {
  /** Get the VSCode API instance (null if not in VSCode context) */
  get(): VSCodeAPI | null;
  /** Check if running in VSCode webview context */
  isVSCodeContext(): boolean;
  /** Send message to Extension Host */
  postMessage(message: unknown): void;
  /** Get persisted state */
  getState<T>(): T | undefined;
  /** Set persisted state */
  setState<T>(state: T): void;
  /** Send request and wait for response */
  sendRequest<TResponse = unknown>(
    message: Omit<RequestMessage, '_requestId'>,
    options?: SendRequestOptions,
  ): Promise<TResponse>;
  /** Cancel a pending request */
  cancelRequest(requestId: string): boolean;
  /** Get count of pending requests */
  getPendingRequestCount(): number;
}

/**
 * VSCode Webview API Module
 *
 * Provides centralized, type-safe access to VSCode Webview API.
 * Used by both assistant and webview packages.
 *
 * @example
 * ```typescript
 * import { vscodeApi, postMessage, sendRequest } from '@neko/shared/vscode';
 *
 * // Simple message
 * postMessage({ type: 'save', content: data });
 *
 * // Request-response pattern
 * const result = await sendRequest<FileInfo>({ type: 'getFileInfo', path: '/file' });
 * ```
 */

export * from './types';
export * from './api';

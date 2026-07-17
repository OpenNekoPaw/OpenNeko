/**
 * File URI resolution utilities
 *
 * Manages webview URI caching and async resolution for file paths.
 * Extracted from useVSCodeMessaging to break the circular dependency
 * between hooks/useVSCodeMessaging <-> services/ThumbnailService.
 */

import { getVSCodeAPI } from './vscodeApi';

// Get VSCode API singleton
const vscode = getVSCodeAPI();

// Cache for file path -> webview URI mappings
const fileUriCache = new Map<string, string>();

// Reverse cache for webview URI -> file path mappings (for proxyFetch optimization)
const uriToPathCache = new Map<string, string>();

// Pending requests for file URIs
const pendingFileRequests = new Map<string, Array<(uri: string) => void>>();

// Listeners for cache updates (for components to re-render when URI arrives)
const cacheUpdateListeners: Array<() => void> = [];

// =============================================================================
// Global message listener for fileUri responses
// =============================================================================

let globalListenerInitialized = false;

function initGlobalFileUriListener(): void {
  if (globalListenerInitialized) return;
  globalListenerInitialized = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    // Handle fileUri response
    if (message.type === 'fileUri' && message.path && message.uri) {
      handleFileUriResponse(message.path as string, message.uri as string);
    }
  });
}

// Initialize global listener immediately when module loads
initGlobalFileUriListener();

/**
 * Process a fileUri response from the extension host.
 * Updates caches, resolves pending promises, and notifies listeners.
 */
export function handleFileUriResponse(path: string, uri: string): void {
  // Decode URI to handle special characters
  const decodedUri = uri.replace(/%2B/g, '+');
  fileUriCache.set(path, decodedUri);
  // Also update reverse mapping for proxyFetch optimization
  uriToPathCache.set(decodedUri, path);

  // Resolve any pending promises
  const pending = pendingFileRequests.get(path);
  if (pending) {
    pending.forEach((resolve) => resolve(decodedUri));
    pendingFileRequests.delete(path);
  }

  // Notify listeners
  cacheUpdateListeners.forEach((listener) => listener());
}

/**
 * Get a webview URI for a file path asynchronously.
 * Module-level function — works outside of React component tree.
 */
export function getFileUri(path: string): Promise<string> {
  // Check cache first
  const cached = fileUriCache.get(path);
  if (cached) {
    return Promise.resolve(cached);
  }

  // Request from extension
  return new Promise((resolve) => {
    // Add to pending requests
    if (!pendingFileRequests.has(path)) {
      pendingFileRequests.set(path, []);
      // Send request via vscode API
      if (vscode) {
        vscode.postMessage({ type: 'requestFile', path });
      } else {
        // In dev mode, just return the path as-is
        resolve(path);
        return;
      }
    }
    pendingFileRequests.get(path)!.push(resolve);
  });
}

/**
 * Request a webview URI from the extension host (fire-and-forget)
 */
export function requestFileUri(path: string): void {
  if (!fileUriCache.has(path)) {
    vscode?.postMessage({ type: 'requestFile', path });
  }
}

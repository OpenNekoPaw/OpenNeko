// =============================================================================
// Webview Asset Utilities — L1 (Extension Host only)
//
// Converts GeneratedAsset disk paths to webview-safe URIs.
// Each extension calls this before posting assets to its webview.
//
// Import via: @neko/shared/vscode/extension
// =============================================================================

import * as vscode from 'vscode';
import type { BaseGeneratedAsset, WebviewGeneratedAsset } from '../../types/generated-asset';

/**
 * Augment a GeneratedAsset with a webview-safe URI derived from its disk path.
 *
 * Webviews cannot access `file://` paths directly due to CSP restrictions.
 * This function converts `asset.path` via `webview.asWebviewUri()` and returns
 * the original asset plus a `webviewUri` field.
 *
 * @example
 * ```typescript
 * const image = await generateImage(prompt);
 * const safe = toWebviewAsset(image, panel.webview);
 * panel.webview.postMessage({ type: 'assetReady', asset: safe });
 * // In webview: <img src={asset.webviewUri} />
 * ```
 */
export function toWebviewAsset<T extends BaseGeneratedAsset>(
  asset: T,
  webview: vscode.Webview,
): WebviewGeneratedAsset<T> {
  const uri = vscode.Uri.file(asset.path);
  return { ...asset, webviewUri: webview.asWebviewUri(uri).toString() };
}

/**
 * i18n Bridge - VSCode locale utilities for Extension Host
 *
 * Helps Extension Host detect VSCode language and pass it to webviews.
 *
 * Layer 1: Requires vscode API (Extension Host only).
 * Import via: @neko/shared/vscode/extension
 */

import * as vscode from 'vscode';
import { normalizeLocale } from '../../i18n/core';
import type { SupportedLocale } from '../../i18n/types';

/**
 * Get current VSCode display language, normalized to SupportedLocale
 */
export function getVSCodeLocale(): SupportedLocale {
  return normalizeLocale(vscode.env.language);
}

/**
 * Generate HTML attributes for injecting locale into webview
 *
 * Usage in EditorProvider.getHtmlForWebview():
 * ```html
 * <html ${injectLocaleAttribute()}>
 * ```
 *
 * The webview can then read it via:
 * ```typescript
 * import { detectWebviewLocale } from '@neko/shared';
 * const locale = detectWebviewLocale();
 * ```
 */
export function injectLocaleAttribute(): string {
  const locale = vscode.env.language;
  return `lang="${locale}" data-vscode-locale="${locale}"`;
}

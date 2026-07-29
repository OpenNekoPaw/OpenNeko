/**
 * Preview typed facade over the shared VS Code Webview bridge.
 *
 * The shared bridge owns acquisition and non-VS Code no-op behavior; Preview
 * keeps only the document-viewer API shape.
 */

import {
  getState as getSharedState,
  postMessage as postRawMessage,
  setState as setSharedState,
} from '@neko/shared/vscode';

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): Record<string, unknown> | null;
  setState(state: unknown): void;
}

export function getVscodeApi(): VsCodeApi {
  return {
    postMessage(message: unknown): void {
      postRawMessage(message);
    },
    getState(): Record<string, unknown> | null {
      return getSharedState<Record<string, unknown>>() ?? null;
    },
    setState(state: unknown): void {
      setSharedState(state);
    },
  };
}

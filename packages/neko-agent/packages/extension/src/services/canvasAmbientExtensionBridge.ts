import * as vscode from 'vscode';
import { isNekoCanvasAPI } from '@neko/shared';
import { resolveNekoExtension } from '@neko/shared/vscode/extension';
import { NEKO_PLUGIN_EXTENSION_IDS } from '@neko-agent/types';
import { projectCanvasAssetChangeSummary, projectCanvasChangeSummary } from '@neko/agent/runtime';
import {
  onDidChangeCanvasSelection,
  recordCanvasChange,
  setCanvasSelection,
  type SelectedNodeSummary,
} from './canvasAmbientContext';

export interface CanvasAmbientExtensionBridgeOptions {
  readonly onSelectionChanged: (nodes: SelectedNodeSummary[]) => void;
}

/**
 * Register VSCode extension-host bridges for ambient canvas context.
 *
 * The bridge owns only host effects: subscribing to neko-canvas events and
 * forwarding normalized ambient updates. Conversation-scoped storage stays in
 * canvasAmbientContext / agent runtime.
 */
export function registerCanvasAmbientExtensionBridge(
  context: vscode.ExtensionContext,
  options: CanvasAmbientExtensionBridgeOptions,
): void {
  subscribeCanvasSelection(context);
  context.subscriptions.push(
    onDidChangeCanvasSelection((nodes) => {
      options.onSelectionChanged(nodes);
    }),
  );
}

/**
 * Subscribe to NekoCanvas selection changes for ambient context injection.
 * Also subscribes to asset and canvas change events so the agent can track
 * mutations between interactions.
 */
export function subscribeCanvasSelection(context: vscode.ExtensionContext): void {
  const canvasExt = resolveNekoExtension(NEKO_PLUGIN_EXTENSION_IDS.canvas, (id) =>
    vscode.extensions.getExtension(id),
  );
  if (!canvasExt) return;

  const activate = canvasExt.isActive ? Promise.resolve(canvasExt.exports) : canvasExt.activate();

  void Promise.resolve(activate)
    .then((api) => {
      if (!isNekoCanvasAPI(api)) {
        throw new Error('Neko Canvas API contract mismatch.');
      }

      if (api.nodes?.onSelectionChange) {
        context.subscriptions.push(
          api.nodes.onSelectionChange((nodes) => setCanvasSelection(nodes)),
        );
      }

      if (api.events?.onDidChangeAssets) {
        context.subscriptions.push(
          api.events.onDidChangeAssets((ev) => {
            const summary = projectCanvasAssetChangeSummary(ev);
            if (summary) {
              recordCanvasChange(summary);
            }
          }),
        );
      }

      if (api.events?.onDidChangeCanvas) {
        context.subscriptions.push(
          api.events.onDidChangeCanvas((ev) => {
            const summary = projectCanvasChangeSummary(ev);
            if (summary) {
              recordCanvasChange(summary);
            }
          }),
        );
      }
    })
    .catch(() => {
      // neko-canvas not available — ambient context simply stays empty
    });
}

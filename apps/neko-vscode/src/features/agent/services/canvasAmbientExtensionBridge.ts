import type { FeatureRuntimeContext } from '../../../feature-runtime-context';
import type { NekoCanvasAPI } from '@neko/shared';
import { projectCanvasChangeSummary } from '@neko/agent/runtime';
import {
  onDidChangeCanvasSelection,
  recordCanvasChange,
  setCanvasSelection,
  type SelectedNodeSummary,
} from './canvasAmbientContext';

export interface CanvasAmbientExtensionBridgeOptions {
  readonly canvas: NekoCanvasAPI;
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
  context: FeatureRuntimeContext,
  options: CanvasAmbientExtensionBridgeOptions,
): void {
  subscribeCanvasSelection(context, options.canvas);
  context.subscriptions.push(
    onDidChangeCanvasSelection((nodes) => {
      options.onSelectionChanged(nodes);
    }),
  );
}

/**
 * Subscribe to NekoCanvas selection changes for ambient context injection.
 * Also subscribes to canvas change events so the agent can track mutations
 * between interactions.
 */
function subscribeCanvasSelection(context: FeatureRuntimeContext, canvas: NekoCanvasAPI): void {
  if (canvas.nodes?.onSelectionChange) {
    context.subscriptions.push(
      canvas.nodes.onSelectionChange((nodes) => setCanvasSelection(nodes)),
    );
  }

  if (canvas.events?.onDidChangeCanvas) {
    context.subscriptions.push(
      canvas.events.onDidChangeCanvas((event) => {
        const summary = projectCanvasChangeSummary(event);
        if (summary) {
          recordCanvasChange(summary);
        }
      }),
    );
  }
}

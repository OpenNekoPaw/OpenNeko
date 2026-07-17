/**
 * DragDropBroker - Cross-extension drag-and-drop payload mediator (ADR-5 P1)
 *
 * VSCode webview iframes cannot transfer HTML5 drag events between each other.
 * The Extension Host must hold the dragged payload so the receiving webview
 * can query it on drop via a shared command.
 *
 * Flow:
 *   1. Agent webview  -> postMessage('dnd:start', asset)  -> Extension stores payload
 *   2. Target webview -> postMessage('dnd:drop')           -> Extension queries payload
 *   3. Extension      -> dispatches import command          -> clears payload
 */

import { getLogger } from '../base';

const logger = getLogger('DragDropBroker');

/** Asset payload transferred during a cross-extension drag operation. */
export interface DndAssetPayload {
  /** Absolute file path on disk */
  readonly path: string;
  /** Media type hint for the target extension */
  readonly mediaType: 'image' | 'video' | 'audio';
  /** Human-readable display name */
  readonly name: string;
}

/**
 * Singleton-per-extension payload holder for cross-webview drag-and-drop.
 *
 * Responsibilities:
 * - Store the dragged asset payload on drag start
 * - Return and clear the payload on drop
 */
export class DragDropBroker {
  private _payload: DndAssetPayload | null = null;

  /** Store the asset payload when a drag operation starts. */
  setPayload(asset: DndAssetPayload): void {
    this._payload = asset;
    logger.debug(`DnD payload set: ${asset.name} (${asset.mediaType})`);
  }

  /** Retrieve the current payload (returns null if none). */
  getPayload(): DndAssetPayload | null {
    return this._payload;
  }

  /** Clear the stored payload (called after successful drop or drag cancel). */
  clearPayload(): void {
    if (this._payload) {
      logger.debug('DnD payload cleared');
    }
    this._payload = null;
  }
}

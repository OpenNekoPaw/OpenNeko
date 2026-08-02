/**
 * useClipboard - Clipboard operations for canvas nodes
 *
 * Wraps the clipboard store to provide copy, cut, paste, and duplicate
 * operations that integrate with canvas and history stores.
 */

import { useCallback } from 'react';
import type { CanvasNode, CanvasConnection } from '@neko-canvas/domain';
import {
  useCanvasStoreApi,
  useClipboardStoreApi,
  useHistoryStoreApi,
} from '../stores/canvasStoreScope';

// =============================================================================
// Types
// =============================================================================

export interface UseClipboardOptions {
  selectedNodeIds: string[];
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  deleteSelected: () => void;
}

export interface UseClipboardReturn {
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handlePasteInPlace: () => void;
  handleDuplicate: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useClipboard(options: UseClipboardOptions): UseClipboardReturn {
  const { selectedNodeIds, nodes, connections, deleteSelected } = options;
  const canvasStore = useCanvasStoreApi();
  const clipboardStore = useClipboardStoreApi();
  const historyStore = useHistoryStoreApi();

  const handleCopy = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    clipboardStore.getState().copy(selectedNodeIds, nodes, connections);
  }, [clipboardStore, selectedNodeIds, nodes, connections]);

  const handleCut = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    clipboardStore.getState().cut(selectedNodeIds, nodes, connections);
    deleteSelected();
  }, [clipboardStore, selectedNodeIds, nodes, connections, deleteSelected]);

  const doPaste = useCallback(
    (offset?: { x: number; y: number }) => {
      const result = clipboardStore.getState().paste(offset);
      if (!result) return;

      const { canvasData: currentData } = canvasStore.getState();
      if (!currentData) return;

      // Record history before batch paste
      historyStore.getState().pushState(currentData);

      // Batch add: directly update canvasData for efficiency
      const store = canvasStore.getState();
      if (store.canvasData) {
        const updatedData = {
          ...store.canvasData,
          nodes: [...store.canvasData.nodes, ...result.nodes],
          connections: [...store.canvasData.connections, ...result.connections],
        };
        store.setCanvasData(updatedData);

        // Select the pasted nodes
        const { selectNodes } = canvasStore.getState();
        selectNodes(result.nodes.map((n) => n.id));
      }
    },
    [canvasStore, clipboardStore, historyStore],
  );

  const handlePaste = useCallback(() => doPaste(), [doPaste]);

  const handlePasteInPlace = useCallback(() => doPaste({ x: 0, y: 0 }), [doPaste]);

  const handleDuplicate = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const result = clipboardStore.getState().duplicate(selectedNodeIds, nodes, connections);
    if (!result) return;

    const { canvasData: currentData } = canvasStore.getState();
    if (!currentData) return;

    historyStore.getState().pushState(currentData);

    const store = canvasStore.getState();
    if (store.canvasData) {
      const updatedData = {
        ...store.canvasData,
        nodes: [...store.canvasData.nodes, ...result.nodes],
        connections: [...store.canvasData.connections, ...result.connections],
      };
      store.setCanvasData(updatedData);

      const { selectNodes } = canvasStore.getState();
      selectNodes(result.nodes.map((n) => n.id));
    }
  }, [canvasStore, clipboardStore, historyStore, selectedNodeIds, nodes, connections]);

  return { handleCopy, handleCut, handlePaste, handlePasteInPlace, handleDuplicate };
}

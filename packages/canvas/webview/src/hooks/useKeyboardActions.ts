/**
 * useKeyboardActions - Keyboard shortcut dispatch handler
 *
 * Maps explicit keyboard action strings from Desktop host routing to
 * the corresponding canvas operations. Local DOM keyboard shortcuts are owned
 * by useCanvasKeyboardController.
 */

import { useCallback } from 'react';
import { hasEditableActiveElement } from '@neko/ui/keyboard';
import type { CanvasNode } from '@neko/canvas-domain';
import { useCanvasStoreApi } from '../stores/canvasStoreScope';
import type { CanvasHostMessagePort } from './useCanvasHostMessages';
import { isEditorLevelKeyboardAction } from './keyboardActionPolicy';

// =============================================================================
// Types
// =============================================================================

export interface UseKeyboardActionsOptions {
  hostPort: CanvasHostMessagePort;
  selectedNodeIds: string[];
  selectedConnectionIds: string[];
  nodes: CanvasNode[];
  contextMenu: unknown | null;
  setContextMenu: (menu: null) => void;
  selectNode: (id: string, multi?: boolean) => void;
  selectConnection: (id: string, multi?: boolean) => void;
  deleteSelected: () => void;
  clearSelection: () => void;
  resetViewport: () => void;
  undo: () => void;
  redo: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handlePasteInPlace: () => void;
  handleDuplicate: () => void;
  closeTransientSurface?: () => boolean;
  reportAction: (action: string, label: string, detail?: string) => void;
  isKeyboardFocusedRef?: React.MutableRefObject<boolean>;
  isComposingRef?: React.MutableRefObject<boolean>;
}

export interface UseKeyboardActionsReturn {
  handleKeyboardAction: (action: string) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useKeyboardActions(options: UseKeyboardActionsOptions): UseKeyboardActionsReturn {
  const canvasStore = useCanvasStoreApi();
  const {
    selectedNodeIds,
    selectedConnectionIds,
    nodes,
    contextMenu,
    setContextMenu,
    selectNode,
    selectConnection,
    deleteSelected,
    clearSelection,
    resetViewport,
    undo,
    redo,
    handleCopy,
    handleCut,
    handlePaste,
    handlePasteInPlace,
    handleDuplicate,
    closeTransientSurface,
    reportAction,
    isKeyboardFocusedRef,
    isComposingRef,
  } = options;

  const handleKeyboardAction = useCallback(
    (action: string) => {
      if (isKeyboardFocusedRef?.current === false) {
        return;
      }
      if (
        isEditorLevelKeyboardAction(action) &&
        (isComposingRef?.current || hasEditableActiveElement())
      ) {
        return;
      }

      // Handle outline selection commands (selectNode:id, selectConnection:id)
      if (action.startsWith('selectNode:')) {
        const nodeId = action.slice('selectNode:'.length);
        selectNode(nodeId);
        return;
      }
      if (action.startsWith('selectConnection:')) {
        const connId = action.slice('selectConnection:'.length);
        selectConnection(connId);
        return;
      }
      if (action.startsWith('deleteNode:')) {
        const nodeId = action.slice('deleteNode:'.length);
        if (nodeId) {
          canvasStore.getState().removeNode(nodeId);
          reportAction('deleteNode', `Deleted node from outline`);
        }
        return;
      }

      switch (action) {
        case 'deleteSelected':
          if (selectedNodeIds.length > 0 || selectedConnectionIds.length > 0) {
            deleteSelected();
            reportAction('deleteNode', `Deleted ${selectedNodeIds.length} node(s)`);
          }
          break;
        case 'escape':
          if (contextMenu) {
            setContextMenu(null);
          } else if (closeTransientSurface?.()) {
            return;
          } else {
            clearSelection();
          }
          break;
        case 'selectAll':
          if (nodes.length > 0) {
            const { selectNodes } = canvasStore.getState();
            selectNodes(nodes.map((n) => n.id));
          }
          break;
        case 'undo':
          undo();
          reportAction('undo', 'Undo');
          break;
        case 'redo':
          redo();
          reportAction('redo', 'Redo');
          break;
        case 'copy':
          handleCopy();
          break;
        case 'cut':
          handleCut();
          reportAction('deleteNode', `Cut ${selectedNodeIds.length} node(s)`);
          break;
        case 'paste':
          handlePaste();
          reportAction('paste', 'Paste');
          break;
        case 'pasteInPlace':
          handlePasteInPlace();
          reportAction('paste', 'Paste In Place');
          break;
        case 'duplicate':
          handleDuplicate();
          reportAction('paste', 'Duplicate');
          break;
        case 'resetZoom':
          resetViewport();
          break;
      }
    },
    [
      canvasStore,
      isKeyboardFocusedRef,
      isComposingRef,
      selectedNodeIds,
      selectedConnectionIds,
      deleteSelected,
      clearSelection,
      nodes,
      contextMenu,
      undo,
      redo,
      handleCopy,
      handleCut,
      handlePaste,
      handlePasteInPlace,
      handleDuplicate,
      closeTransientSurface,
      selectNode,
      selectConnection,
      resetViewport,
      reportAction,
      setContextMenu,
    ],
  );

  return { handleKeyboardAction };
}

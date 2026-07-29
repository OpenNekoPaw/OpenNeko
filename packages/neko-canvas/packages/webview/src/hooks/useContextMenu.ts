/**
 * useContextMenu - Context menu state and builder
 *
 * Manages the context menu visibility, position, and menu item
 * construction based on current selection state.
 */

import { useCallback, useState } from 'react';
import type { CanvasNode } from '@neko/shared';
import { buildCanvasMenuItems, buildNodeMenuItems } from '../components/common/ContextMenu';
import type { MenuEntry } from '../components/common/ContextMenu';
import {
  useCanvasStoreApi,
  useClipboardStoreApi,
  useHistoryStoreApi,
} from '../stores/canvasStoreScope';
import type { CanvasAddActionId } from '../utils/canvasAddActions';

// =============================================================================
// Types
// =============================================================================

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

export interface UseContextMenuOptions {
  selectedNodeIds: string[];
  nodes: CanvasNode[];
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  addActionAt: (actionId: CanvasAddActionId, pos: { x: number; y: number }) => void;
  deleteSelected: () => void;
  handleFitContent: () => void;
  handleResetViewport: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handlePasteInPlace: () => void;
  handleDuplicate: () => void;
  handleGroup: () => void;
  handleUngroup: () => void;
  undo: () => void;
  redo: () => void;
  onSendToAgent?: (intent?: string) => void;
  onSetPlaybackEntry?: (nodeId: string) => void;
}

export interface UseContextMenuReturn {
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  closeContextMenu: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useContextMenu(options: UseContextMenuOptions): UseContextMenuReturn {
  const canvasStore = useCanvasStoreApi();
  const clipboardStore = useClipboardStoreApi();
  const historyStore = useHistoryStoreApi();
  const {
    selectedNodeIds,
    nodes,
    screenToCanvas,
    addActionAt,
    deleteSelected,
    handleFitContent,
    handleResetViewport,
    handleCopy,
    handleCut,
    handlePaste,
    handlePasteInPlace,
    handleDuplicate,
    handleGroup,
    handleUngroup,
    undo,
    redo,
    onSendToAgent,
    onSetPlaybackEntry,
  } = options;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      // Detect whether the right-click landed on a node or on blank canvas
      const clickedNodeElement = (e.target as HTMLElement).closest('[data-node-id]');
      const contextNodeId = clickedNodeElement?.getAttribute('data-node-id') ?? undefined;
      const clickedOnNode = contextNodeId !== undefined;
      const effectiveSelectedNodeIds =
        contextNodeId && !selectedNodeIds.includes(contextNodeId)
          ? [contextNodeId]
          : selectedNodeIds;
      if (contextNodeId && !selectedNodeIds.includes(contextNodeId)) {
        canvasStore.getState().selectNode(contextNodeId);
      }
      const showNodeMenu = clickedOnNode;

      const menuCtx = {
        canvasPosition: canvasPos,
        hasSelection: showNodeMenu,
        selectedCount: effectiveSelectedNodeIds.length,
        onAddAction: addActionAt,
        onDelete: deleteSelected,
        onSelectAll: () => {
          const { selectNodes } = canvasStore.getState();
          selectNodes(nodes.map((n) => n.id));
        },
        onFitContent: handleFitContent,
        onResetView: handleResetViewport,
        onCopy: handleCopy,
        onCut: handleCut,
        onPaste: handlePaste,
        onPasteInPlace: handlePasteInPlace,
        onDuplicate: handleDuplicate,
        onGroup: handleGroup,
        onUngroup: handleUngroup,
        onSetPlaybackEntry,
        contextNodeId,
        canGroup: effectiveSelectedNodeIds.length >= 2,
        canUngroup:
          effectiveSelectedNodeIds.length === 1 &&
          (nodes.find((n) => n.id === effectiveSelectedNodeIds[0])?.type as string) === 'group',
        onUndo: undo,
        onRedo: redo,
        canPaste: clipboardStore.getState().canPaste(),
        canUndo: historyStore.getState().canUndo(),
        canRedo: historyStore.getState().canRedo(),
        onSendToAgent,
      };

      const items = showNodeMenu ? buildNodeMenuItems(menuCtx) : buildCanvasMenuItems(menuCtx);

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      screenToCanvas,
      canvasStore,
      clipboardStore,
      historyStore,
      selectedNodeIds,
      nodes,
      addActionAt,
      deleteSelected,
      handleFitContent,
      handleResetViewport,
      handleCopy,
      handleCut,
      handlePaste,
      handlePasteInPlace,
      handleDuplicate,
      handleGroup,
      handleUngroup,
      undo,
      redo,
      onSendToAgent,
      onSetPlaybackEntry,
    ],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, setContextMenu, handleContextMenu, closeContextMenu };
}

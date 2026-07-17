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
import { useClipboardStore } from '../stores/clipboardStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useHistoryStore } from '../stores/historyStore';

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
  addTextAt: (pos: { x: number; y: number }) => void;
  addSceneGroupAt: (pos: { x: number; y: number }) => void;
  addShotAt: (pos: { x: number; y: number }) => void;
  addGalleryAt: (pos: { x: number; y: number }) => void;
  addTableAt: (pos: { x: number; y: number }) => void;
  handleImportFile: () => void;
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
  onGenerateSelected?: () => void;
  onBatchGenerate?: () => void;
  onSendToAgent?: (intent?: string) => void;
  onEditInSketch?: () => void;
  onGenerateVideo?: () => void;
  onEditWithControlNet?: () => void;
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
  const {
    selectedNodeIds,
    nodes,
    screenToCanvas,
    addTextAt,
    addSceneGroupAt,
    addShotAt,
    addGalleryAt,
    addTableAt,
    handleImportFile,
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
    onGenerateSelected,
    onBatchGenerate,
    onSendToAgent,
    onEditInSketch,
    onGenerateVideo,
    onEditWithControlNet,
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
        useCanvasStore.getState().selectNode(contextNodeId);
      }
      const showNodeMenu = clickedOnNode;

      const selectedNodes = nodes.filter((n) => effectiveSelectedNodeIds.includes(n.id));
      const menuCtx = {
        canvasPosition: canvasPos,
        hasSelection: showNodeMenu,
        selectedCount: effectiveSelectedNodeIds.length,
        onAddText: addTextAt,
        onAddScene: addSceneGroupAt,
        onAddShot: addShotAt,
        onAddGallery: addGalleryAt,
        onAddTable: addTableAt,
        onImportFile: handleImportFile,
        onDelete: deleteSelected,
        onSelectAll: () => {
          const { selectNodes } = useCanvasStore.getState();
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
        canPaste: useClipboardStore.getState().canPaste(),
        canUndo: useHistoryStore.getState().canUndo(),
        canRedo: useHistoryStore.getState().canRedo(),
        hasShotSelected: selectedNodes.some((n) => n.type === 'shot'),
        hasShotWithImage: selectedNodes.some(
          (n) =>
            n.type === 'shot' && Boolean((n.data as Record<string, unknown>)['generatedImage']),
        ),
        onGenerateSelected,
        onBatchGenerate,
        onSendToAgent,
        onEditInSketch,
        onGenerateVideo,
        onEditWithControlNet,
      };

      const items = showNodeMenu ? buildNodeMenuItems(menuCtx) : buildCanvasMenuItems(menuCtx);

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [
      screenToCanvas,
      selectedNodeIds,
      nodes,
      addTextAt,
      addSceneGroupAt,
      addShotAt,
      addGalleryAt,
      addTableAt,
      handleImportFile,
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
      onGenerateSelected,
      onBatchGenerate,
      onSendToAgent,
      onEditInSketch,
      onGenerateVideo,
      onEditWithControlNet,
      onSetPlaybackEntry,
    ],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, setContextMenu, handleContextMenu, closeContextMenu };
}

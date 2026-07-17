/**
 * useConnectionDrag - Hook for connection creation via drag
 * Handles the interaction of dragging from a connection handle.
 */

import { useState, useCallback, useEffect } from 'react';
import type React from 'react';
import type { CanvasViewport } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface UseConnectionDragOptions {
  viewport: CanvasViewport;
  containerRef: React.RefObject<HTMLElement>;
  onConnectionStart?: (nodeId: string, handleId: string) => void;
  onConnectionComplete?: (
    sourceNodeId: string,
    sourceHandleId: string,
    targetNodeId: string,
    targetHandleId: string,
  ) => void;
  onConnectionCancel?: () => void;
}

export interface PendingConnection {
  sourceNodeId: string;
  sourceHandleId: string;
  mousePosition: { x: number; y: number };
}

export interface UseConnectionDragReturn {
  pendingConnection: PendingConnection | null;
  isConnecting: boolean;
  startConnection: (nodeId: string, handleId: string, e: React.MouseEvent) => void;
  updateConnection: (e: MouseEvent) => void;
  completeConnection: (targetNodeId: string, targetHandleId: string) => void;
  cancelConnection: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useConnectionDrag({
  viewport,
  containerRef,
  onConnectionStart,
  onConnectionComplete,
  onConnectionCancel,
}: UseConnectionDragOptions): UseConnectionDragReturn {
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };

      const rect = container.getBoundingClientRect();
      const x = (screenX - rect.left - viewport.pan.x) / viewport.zoom;
      const y = (screenY - rect.top - viewport.pan.y) / viewport.zoom;

      return { x, y };
    },
    [viewport, containerRef],
  );

  // Start a new connection from a handle.
  const startConnection = useCallback(
    (nodeId: string, handleId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      setPendingConnection({
        sourceNodeId: nodeId,
        sourceHandleId: handleId,
        mousePosition: canvasPos,
      });
      setIsConnecting(true);
      onConnectionStart?.(nodeId, handleId);
    },
    [screenToCanvas, onConnectionStart],
  );

  // Update the pending connection position
  const updateConnection = useCallback(
    (e: MouseEvent) => {
      if (!isConnecting) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      setPendingConnection((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mousePosition: canvasPos,
        };
      });
    },
    [isConnecting, screenToCanvas],
  );

  // Complete the connection to a target handle.
  const completeConnection = useCallback(
    (targetNodeId: string, targetHandleId: string) => {
      if (!pendingConnection) return;

      // Don't connect to self
      if (pendingConnection.sourceNodeId === targetNodeId) {
        cancelConnection();
        return;
      }

      onConnectionComplete?.(
        pendingConnection.sourceNodeId,
        pendingConnection.sourceHandleId,
        targetNodeId,
        targetHandleId,
      );

      setPendingConnection(null);
      setIsConnecting(false);
    },
    [pendingConnection, onConnectionComplete],
  );

  // Cancel the pending connection
  const cancelConnection = useCallback(() => {
    setPendingConnection(null);
    setIsConnecting(false);
    onConnectionCancel?.();
  }, [onConnectionCancel]);

  // Handle mouse events for connection dragging
  useEffect(() => {
    if (!isConnecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateConnection(e);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Check if we're over a connection handle.
      const target = e.target as HTMLElement;
      const handleElement = target.closest('[data-connection-handle]');

      if (handleElement) {
        const nodeId = handleElement.getAttribute('data-node-id');
        const handleId = handleElement.getAttribute('data-connection-handle');

        if (nodeId && handleId) {
          completeConnection(nodeId, handleId);
          return;
        }
      }

      // Cancel if not dropped on an anchor
      cancelConnection();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isConnecting, updateConnection, completeConnection, cancelConnection]);

  return {
    pendingConnection,
    isConnecting,
    startConnection,
    updateConnection,
    completeConnection,
    cancelConnection,
  };
}

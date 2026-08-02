/**
 * useConnectionDrag - Hook for connection creation via drag
 * Handles the interaction of dragging from a connection handle.
 */

import { useState, useCallback, useEffect } from 'react';
import type React from 'react';
import type { CanvasConnection, CanvasNode, CanvasViewport } from '@neko/canvas-domain';
import {
  createNodeConnectionEndpoint,
  createPortConnectionEndpoint,
  getDefaultPorts,
} from '@neko/canvas-domain';
import type {
  CanvasConnectionMutationResult,
  CanvasConnectionRejectionReason,
  CanvasConnectionValidationResult,
} from '../utils/canvasConnectionAuthoring';

// =============================================================================
// Types
// =============================================================================

export interface UseConnectionDragOptions {
  viewport: CanvasViewport;
  containerRef: React.RefObject<HTMLElement>;
  nodes: readonly CanvasNode[];
  onConnectionStart?: (nodeId: string, handleId: string) => void;
  onConnectionComplete?: (
    connection: Omit<CanvasConnection, 'id'>,
  ) => CanvasConnectionMutationResult;
  validateConnection?: (
    connection: Omit<CanvasConnection, 'id'>,
  ) => CanvasConnectionValidationResult;
  onConnectionCancel?: () => void;
  onConnectionStateChange?: (isConnecting: boolean) => void;
}

export interface PendingConnection {
  sourceNodeId: string;
  sourceHandleId: string;
  sourceEndpoint: CanvasConnection['sourceEndpoint'];
  mousePosition: { x: number; y: number };
}

export interface ConnectionDragTargetState {
  readonly nodeId: string;
  readonly validity: 'valid' | 'invalid';
  readonly reason?: CanvasConnectionRejectionReason;
}

export interface UseConnectionDragReturn {
  pendingConnection: PendingConnection | null;
  isConnecting: boolean;
  targetState: ConnectionDragTargetState | null;
  startConnection: (nodeId: string, handleId: string, e: React.MouseEvent) => void;
  updateConnection: (e: MouseEvent) => void;
  cancelConnection: () => void;
}

export type ConnectionDropTargetResolution =
  | {
      readonly ok: true;
      readonly target: {
        readonly nodeId: string;
        readonly handleId: string;
        readonly endpoint: CanvasConnection['targetEndpoint'];
      };
    }
  | {
      readonly ok: false;
      readonly reason: 'missing-target' | 'self-connection' | 'target-direction';
      readonly targetNodeId?: string;
    };

// =============================================================================
// Hook
// =============================================================================

export function useConnectionDrag({
  viewport,
  containerRef,
  nodes,
  onConnectionStart,
  onConnectionComplete,
  validateConnection,
  onConnectionCancel,
  onConnectionStateChange,
}: UseConnectionDragOptions): UseConnectionDragReturn {
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [targetState, setTargetState] = useState<ConnectionDragTargetState | null>(null);

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
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) throw new Error(`Canvas connection source node "${nodeId}" is missing`);
      const port = (node.ports ?? getDefaultPorts(node.type)).find(
        (candidate) => candidate.id === handleId,
      );
      if (port?.type === 'input') return;

      setPendingConnection({
        sourceNodeId: nodeId,
        sourceHandleId: handleId,
        sourceEndpoint: port
          ? createPortConnectionEndpoint(nodeId, handleId)
          : createNodeConnectionEndpoint(nodeId),
        mousePosition: canvasPos,
      });
      setIsConnecting(true);
      setTargetState(null);
      onConnectionStart?.(nodeId, handleId);
    },
    [nodes, screenToCanvas, onConnectionStart],
  );

  // Update the pending connection position
  const updateConnection = useCallback(
    (e: MouseEvent) => {
      if (!isConnecting) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const currentPending = pendingConnection;
      if (currentPending) {
        const element =
          document.elementFromPoint(e.clientX, e.clientY) ??
          (e.target instanceof Element ? e.target : null);
        const resolution = resolveConnectionDropTarget(element, currentPending.sourceNodeId, nodes);
        setTargetState(resolveTargetState(resolution, currentPending, validateConnection) ?? null);
      }

      setPendingConnection((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mousePosition: canvasPos,
        };
      });
    },
    [isConnecting, nodes, pendingConnection, screenToCanvas, validateConnection],
  );

  const clearConnection = useCallback(() => {
    setPendingConnection(null);
    setIsConnecting(false);
    setTargetState(null);
  }, []);

  // Cancel the pending connection
  const cancelConnection = useCallback(() => {
    clearConnection();
    onConnectionCancel?.();
  }, [clearConnection, onConnectionCancel]);

  // Handle mouse events for connection dragging
  useEffect(() => {
    if (!isConnecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateConnection(e);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!pendingConnection) return;
      const element =
        document.elementFromPoint(e.clientX, e.clientY) ??
        (e.target instanceof Element ? e.target : null);
      const resolution = resolveConnectionDropTarget(
        element,
        pendingConnection.sourceNodeId,
        nodes,
      );
      if (resolution.ok) {
        const connection = createSequenceConnectionDraft(pendingConnection, resolution.target);
        const validation = validateConnection?.(connection) ?? { ok: true };
        if (validation.ok) {
          const result = onConnectionComplete?.(connection);
          if (!result || result.ok) {
            clearConnection();
            return;
          }
        }
      }
      cancelConnection();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelConnection();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    cancelConnection,
    clearConnection,
    isConnecting,
    nodes,
    onConnectionComplete,
    pendingConnection,
    updateConnection,
    validateConnection,
  ]);

  useEffect(() => {
    onConnectionStateChange?.(isConnecting);
  }, [isConnecting, onConnectionStateChange]);

  return {
    pendingConnection,
    isConnecting,
    targetState,
    startConnection,
    updateConnection,
    cancelConnection,
  };
}

export function resolveConnectionDropTarget(
  target: EventTarget | null,
  sourceNodeId: string,
  nodes: readonly CanvasNode[],
): ConnectionDropTargetResolution {
  if (!(target instanceof Element)) return { ok: false, reason: 'missing-target' };
  const handleElement = target.closest<HTMLElement>('[data-connection-handle]');
  const nodeElement = handleElement ?? target.closest<HTMLElement>('[data-node-id]');
  const targetNodeId = nodeElement?.dataset.nodeId;
  if (!targetNodeId || !nodes.some((node) => node.id === targetNodeId)) {
    return { ok: false, reason: 'missing-target' };
  }
  if (targetNodeId === sourceNodeId) {
    return { ok: false, targetNodeId, reason: 'self-connection' };
  }
  if (handleElement) {
    if (handleElement.dataset.portType === 'output') {
      return { ok: false, targetNodeId, reason: 'target-direction' };
    }
    const handleId = handleElement.dataset.connectionHandle;
    if (!handleId) return { ok: false, targetNodeId, reason: 'missing-target' };
    return {
      ok: true,
      target: {
        nodeId: targetNodeId,
        handleId,
        endpoint:
          handleElement.dataset.endpointScope === 'port'
            ? createPortConnectionEndpoint(targetNodeId, handleId)
            : createNodeConnectionEndpoint(targetNodeId),
      },
    };
  }
  return {
    ok: true,
    target: {
      nodeId: targetNodeId,
      handleId: 'in',
      endpoint: createNodeConnectionEndpoint(targetNodeId),
    },
  };
}

function resolveTargetState(
  resolution: ConnectionDropTargetResolution,
  pending: PendingConnection,
  validateConnection:
    ((connection: Omit<CanvasConnection, 'id'>) => CanvasConnectionValidationResult) | undefined,
): ConnectionDragTargetState | undefined {
  if (!resolution.ok) {
    return resolution.targetNodeId
      ? { nodeId: resolution.targetNodeId, validity: 'invalid', reason: resolution.reason }
      : undefined;
  }
  const validation = validateConnection?.(
    createSequenceConnectionDraft(pending, resolution.target),
  ) ?? { ok: true };
  return validation.ok
    ? { nodeId: resolution.target.nodeId, validity: 'valid' }
    : {
        nodeId: resolution.target.nodeId,
        validity: 'invalid',
        reason: validation.reason,
      };
}

function createSequenceConnectionDraft(
  pending: PendingConnection,
  target: Extract<ConnectionDropTargetResolution, { readonly ok: true }>['target'],
): Omit<CanvasConnection, 'id'> {
  return {
    sourceId: pending.sourceNodeId,
    targetId: target.nodeId,
    type: 'sequence',
    sourceEndpoint: pending.sourceEndpoint,
    targetEndpoint: target.endpoint,
  };
}

/**
 * BaseNode - Base node component
 * Provides common node frame with selection, dragging, and port/anchor points.
 *
 * Domain endpoints remain typed, while the Canvas presents one predictable
 * input handle and one output handle.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasViewport, CanvasNodeType, PortDefinition } from '@neko/canvas-domain';
import { getDefaultPorts } from '@neko/canvas-domain';
import { shouldStartNodeDrag, useNodeDrag } from '../../hooks/useNodeDrag';
import { useNodeResize, type ResizeHandle } from '../../hooks/useNodeResize';
import { useNodeRotate } from '../../hooks/useNodeRotate';
import { clampNodeRenderSize, clampNodeSize, resolveNodeMinSize } from '../../utils/nodeSizing';
import type { NodeSize } from '../../utils/nodeSizing';
import clsx from 'clsx';
import { toCodiconClassName } from '@neko/ui/icons';
import type { NodePresentation } from './nodeTypeDescriptor';
import { getNodeLabel } from './nodeTypeDescriptor';
import { createBuiltInNodeTypeDescriptors } from './nodeTypeDescriptors';
import { t } from '../../i18n';
import type { ConnectionDragTargetState } from '../../hooks/useConnectionDrag';

// =============================================================================
// Types
// =============================================================================

/** Minimal node shape that BaseNode needs — accepts both CanvasNode and extended types */
interface BaseNodeInput {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  rotation?: number;
  locked?: boolean;
  ports?: PortDefinition[];
  container?: unknown;
}

export interface BaseNodeProps {
  node: BaseNodeInput;
  viewport: CanvasViewport;
  isSelected: boolean;
  /** Container ref for coordinate conversion (needed for rotation) */
  containerRef?: React.RefObject<HTMLElement | null>;
  onSelect?: (nodeId: string, multi: boolean) => void;
  /** Called once when a transform gesture starts; does not mutate document data. */
  onTransformStart?: (nodeId: string) => void;
  /** Called on every mousemove during drag (real-time position update) */
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on mouseup when drag ends (final position + history) */
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Called on every mousemove during resize */
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Called on mouseup when resize ends */
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  /** Called on every mousemove during rotation */
  onRotate?: (nodeId: string, rotation: number) => void;
  /** Called on mouseup when rotation ends */
  onRotateEnd?: (nodeId: string, rotation: number) => void;
  onConnectionStart?: (nodeId: string, handleId: string, e: React.MouseEvent) => void;
  isConnecting?: boolean;
  connectionTargetState?: ConnectionDragTargetState | null;
  children: ReactNode;
  /** Compact content identity rendered outside and above the node card. */
  nodeLabel?: {
    readonly icon: ReactNode;
    readonly text: string;
  };
  className?: string;
  autoSizeContent?: boolean;
  minSize?: NodeSize;
  /** Optional visual-only height override. Does not change persisted node.size. */
  renderHeight?: number;
  presentation?: NodePresentation;
  /** Keeps readable content visually separate from the Canvas grid without adding card chrome. */
  opaqueSurface?: boolean;
  renderZIndex?: number;
  onActivate?: (nodeId: string) => void;
  /** Single-node resize/rotate affordances are hidden while a larger selection owns transforms. */
  showTransformHandles?: boolean;
}

const NODE_TYPE_DESCRIPTORS = createBuiltInNodeTypeDescriptors();

// =============================================================================
// Resize handle config
// =============================================================================

const RESIZE_HANDLES: { handle: ResizeHandle; cursor: string; style: React.CSSProperties }[] = [
  { handle: 'n', cursor: 'ns-resize', style: { top: -8, left: 10, right: 10, height: 8 } },
  { handle: 's', cursor: 'ns-resize', style: { bottom: -8, left: 10, right: 10, height: 8 } },
  { handle: 'e', cursor: 'ew-resize', style: { right: -8, top: 10, bottom: 10, width: 8 } },
  { handle: 'w', cursor: 'ew-resize', style: { left: -8, top: 10, bottom: 10, width: 8 } },
  { handle: 'ne', cursor: 'nesw-resize', style: { top: -8, right: -8, width: 12, height: 12 } },
  { handle: 'nw', cursor: 'nesw-resize', style: { top: -8, left: -8, width: 12, height: 12 } },
  { handle: 'se', cursor: 'nwse-resize', style: { bottom: -8, right: -8, width: 12, height: 12 } },
  { handle: 'sw', cursor: 'nwse-resize', style: { bottom: -8, left: -8, width: 12, height: 12 } },
];

// =============================================================================
// Component
// =============================================================================

export function BaseNode({
  node,
  viewport,
  isSelected,
  containerRef,
  onSelect,
  onTransformStart,
  onDrag,
  onMove,
  onResizeEnd,
  onRotateEnd,
  onConnectionStart,
  isConnecting = false,
  connectionTargetState,
  children,
  nodeLabel,
  className,
  autoSizeContent = true,
  minSize,
  renderHeight,
  presentation = 'structured',
  opaqueSurface = false,
  renderZIndex,
  onActivate,
  showTransformHandles = true,
}: BaseNodeProps) {
  const didDragRef = useRef(false);
  const nodeMinSize = minSize ?? resolveNodeMinSize(node);
  const initialResizeSize = useMemo(
    () => clampNodeSize(node.size, nodeMinSize),
    [node.size.width, node.size.height, nodeMinSize.width, nodeMinSize.height],
  );

  // Node dragging
  const {
    position: dragPosition,
    isDragging,
    handlers: dragHandlers,
  } = useNodeDrag({
    nodeId: node.id,
    initialPosition: node.position,
    viewport,
    onDragStart: (nodeId) => {
      didDragRef.current = false;
      onTransformStart?.(nodeId);
    },
    onDrag: (nodeId, position) => {
      didDragRef.current = true;
      onDrag?.(nodeId, position);
    },
    onDragEnd: onMove,
    disabled: node.locked,
  });

  // Node resizing
  const {
    size,
    position: resizePosition,
    isResizing,
    startResize,
  } = useNodeResize({
    nodeId: node.id,
    initialSize: initialResizeSize,
    initialPosition: node.position,
    viewport,
    minWidth: nodeMinSize.width,
    minHeight: nodeMinSize.height,
    onResizeEnd,
    disabled: node.locked,
  });

  // Use resize position/size when resizing, otherwise drag position + node size.
  // renderHeight is a visual-only override used by collapsed composable nodes.
  const currentPosition = isResizing ? resizePosition : dragPosition;
  const currentSize = isResizing ? size : clampNodeSize(node.size, nodeMinSize);
  const displaySize =
    !isResizing && renderHeight !== undefined
      ? clampNodeRenderSize({ ...node, size: currentSize }, { renderHeight, minSize: nodeMinSize })
      : currentSize;

  // Node rotation
  const nodeCenter = useMemo(
    () => ({
      x: currentPosition.x + displaySize.width / 2,
      y: currentPosition.y + displaySize.height / 2,
    }),
    [currentPosition.x, currentPosition.y, displaySize.width, displaySize.height],
  );

  const {
    rotation: currentRotation,
    isRotating,
    startRotate,
  } = useNodeRotate({
    nodeId: node.id,
    initialRotation: node.rotation ?? 0,
    nodeCenter,
    viewport,
    containerRef: containerRef ?? { current: null },
    onRotateEnd,
    disabled: node.locked,
  });

  // Resolve ports: explicit node.ports > default ports for type > empty
  const ports = node.ports ?? getDefaultPorts(node.type as CanvasNodeType);
  const inputPort = ports.find((port) => port.type === 'input');
  const outputPort = ports.find((port) => port.type === 'output');
  const targetState = connectionTargetState?.nodeId === node.id ? connectionTargetState : undefined;

  // Handle node click for selection
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      onSelect?.(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
    },
    [node.id, onSelect],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      didDragRef.current = false;
      if (!isSelected && shouldStartNodeDrag(event.nativeEvent)) {
        onSelect?.(node.id, false);
      }
      dragHandlers.onMouseDown(event);
    },
    [dragHandlers, isSelected, node.id, onSelect],
  );

  // Handle endpoint mousedown for drag-based connection
  const handleAnchorMouseDown = useCallback(
    (handleId: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onConnectionStart?.(node.id, handleId, e);
    },
    [node.id, onConnectionStart],
  );

  const getEndpointHandleStyle = (direction: 'input' | 'output'): React.CSSProperties => {
    const hitSize = 18 / viewport.zoom;
    const visualSize = 10 / viewport.zoom;
    return {
      position: 'absolute',
      width: hitSize,
      height: hitSize,
      borderRadius: '50%',
      background: `radial-gradient(circle, var(--node-border) 0 ${visualSize / 2}px, transparent ${visualSize / 2}px)`,
      cursor: 'crosshair',
      zIndex: 10,
      top: '50%',
      ...(direction === 'input' ? { left: -hitSize / 2 } : { right: -hitSize / 2 }),
      transform: 'translateY(-50%)',
    };
  };

  // Auto-height: sync node height to content (expand or shrink)
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!autoSizeContent || !el || isResizing) return;
    const raf = requestAnimationFrame(() => {
      const scrollH = el.scrollHeight;
      const targetH = Math.max(nodeMinSize.height, scrollH + 4);
      if (Math.abs(targetH - currentSize.height) > 4) {
        onResizeEnd?.(node.id, { width: currentSize.width, height: targetH }, currentPosition);
      }
    });
    return () => cancelAnimationFrame(raf);
  });

  return (
    <div
      data-node-id={node.id}
      data-node-presentation={presentation}
      data-node-selected={isSelected ? 'true' : 'false'}
      data-node-locked={node.locked ? 'true' : undefined}
      data-connection-target-validity={targetState?.validity}
      {...getKeyboardBoundaryMetadata({
        scope: 'node',
        ownerId: node.id,
        priority: isSelected ? 10 : 0,
      })}
      className={clsx(
        'absolute select-none',
        (isResizing || isRotating) && 'pointer-events-auto',
        isDragging && 'cursor-grabbing',
        !isDragging && !isResizing && !isRotating && !node.locked && 'cursor-grab',
        node.locked && 'cursor-not-allowed opacity-80',
        className,
      )}
      style={{
        left: currentPosition.x,
        top: currentPosition.y,
        width: displaySize.width,
        height: displaySize.height,
        zIndex: isDragging || isResizing || isRotating ? 1000 : (renderZIndex ?? node.zIndex),
        transform: currentRotation ? `rotate(${currentRotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
      onMouseDown={handleMouseDown}
      onDragStart={(event) => event.preventDefault()}
      onClick={handleClick}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onActivate?.(node.id);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(node.id, event.shiftKey || event.metaKey || event.ctrlKey);
        }
      }}
      tabIndex={0}
      role="group"
      aria-label={t('node.ariaLabel', {
        type: getNodeLabel(NODE_TYPE_DESCRIPTORS, node.type as CanvasNodeType, t),
        id: node.id,
      })}
    >
      {nodeLabel ? (
        <div className="canvas-node-external-label" data-canvas-node-label title={nodeLabel.text}>
          {nodeLabel.icon}
          <span>{nodeLabel.text}</span>
        </div>
      ) : null}

      {/* Node content */}
      <div
        ref={contentRef}
        className={clsx(
          'node-card w-full h-full overflow-hidden',
          `node-card--${presentation}`,
          opaqueSurface && 'node-card--opaque',
          'transition-colors duration-150',
          isSelected && 'selected',
          (isDragging || isResizing || isRotating) && 'node-card--transforming',
          targetState?.validity === 'valid' && 'node-card--connection-valid',
          targetState?.validity === 'invalid' && 'node-card--connection-invalid',
        )}
      >
        {children}
      </div>

      {/* Derive successor node — "+" button with type picker */}
      {/* Resize handles (visible when selected) */}
      {isSelected &&
        showTransformHandles &&
        !node.locked &&
        RESIZE_HANDLES.map(({ handle, cursor, style }) => (
          <div
            key={handle}
            data-node-transform-handle="resize"
            className="absolute z-20"
            style={{ ...style, cursor, position: 'absolute' }}
            onMouseDown={(e) => {
              onTransformStart?.(node.id);
              startResize(handle, e);
            }}
          />
        ))}

      {/* Rotation handle (visible when selected, above node top center) */}
      {isSelected && showTransformHandles && !node.locked && (
        <>
          {/* Connector line from node top to rotation handle */}
          <div
            data-node-transform-handle="rotate-line"
            className="absolute z-20 pointer-events-none"
            style={{
              left: '50%',
              top: -24,
              width: 1,
              height: 20,
              backgroundColor: 'var(--node-selected)',
              opacity: 0.5,
              transform: 'translateX(-50%)',
            }}
          />
          {/* Rotation handle circle */}
          <div
            data-node-transform-handle="rotate"
            className="absolute z-20 flex items-center justify-center transition-all duration-150 hover:scale-125"
            style={{
              left: '50%',
              top: -36,
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: 'var(--node-selected)',
              border: '2px solid var(--node-bg)',
              transform: 'translateX(-50%)',
              cursor: 'grab',
              fontSize: 9,
              color: 'var(--node-bg)',
              lineHeight: 1,
            }}
            onMouseDown={(e) => {
              onTransformStart?.(node.id);
              startRotate(e);
            }}
            title={t('node.rotation', { degrees: Math.round(currentRotation) })}
          >
            ↻
          </div>
        </>
      )}

      {/* One visual input and one visual output; domain endpoints remain typed. */}
      {[inputPort, outputPort].map((port) =>
        port ? (
          <div
            key={port.id}
            data-port-id={port.id}
            data-port-type={port.type}
            data-endpoint-scope="port"
            data-node-id={node.id}
            data-connection-handle={port.id}
            data-canvas-port-direction={port.type}
            style={getEndpointHandleStyle(port.type)}
            onMouseDown={port.type === 'output' ? handleAnchorMouseDown(port.id) : undefined}
            className={clsx(
              'transition-all duration-150',
              isConnecting && port.type === 'input'
                ? targetState?.validity === 'invalid'
                  ? 'scale-125 opacity-100 ring-2 ring-red-500'
                  : 'scale-125 opacity-100 ring-2 ring-blue-500'
                : isSelected
                  ? 'scale-110 opacity-100'
                  : 'scale-75 opacity-60 hover:scale-110 hover:opacity-100',
            )}
            title={resolvePortTooltip(port)}
          />
        ) : null,
      )}

      {/* Node-level endpoint handles (only when selected) */}
      {ports.length === 0 &&
        isSelected &&
        (['input', 'output'] as const).map((direction) => (
          <div
            key={direction}
            data-node-id={node.id}
            data-connection-handle={direction === 'input' ? 'left' : 'right'}
            data-port-type={direction}
            data-canvas-port-direction={direction}
            style={getEndpointHandleStyle(direction)}
            onMouseDown={direction === 'output' ? handleAnchorMouseDown('right') : undefined}
            className="hover:bg-[var(--node-selected)] hover:scale-125 transition-all duration-150"
          />
        ))}

      {/* Lock indicator */}
      {node.locked && (
        <div className="absolute top-1 right-1 text-xs text-gray-500">
          <span className={toCodiconClassName('lock')} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function resolvePortTooltip(port: PortDefinition): string {
  return port.type === 'input' ? t('port.direction.input') : t('port.direction.output');
}

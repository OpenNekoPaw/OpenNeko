/**
 * BaseNode - Base node component
 * Provides common node frame with selection, dragging, and port/anchor points.
 *
 * Port system:
 * - If node.ports is defined and non-empty, renders typed input/output ports
 * - Otherwise renders node-level endpoint handles on each side
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasViewport, CanvasNodeType, PortDefinition } from '@neko/shared';
import {
  getDefaultPorts,
  getBuiltInCanvasNodePresetMetadata,
  getDefaultCanvasNodePresetName,
} from '@neko/shared';
import { useNodeDrag } from '../../hooks/useNodeDrag';
import { useNodeResize, type ResizeHandle } from '../../hooks/useNodeResize';
import { useNodeRotate } from '../../hooks/useNodeRotate';
import { useCanvasStore } from '../../stores/canvasStore';
import { clampNodeRenderSize, clampNodeSize, resolveNodeMinSize } from '../../utils/nodeSizing';
import type { NodeSize } from '../../utils/nodeSizing';
import clsx from 'clsx';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { t } from '../../i18n';
import type { NodePresentation } from './nodeTypeDescriptor';

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
  children: ReactNode;
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
}

type AnchorPosition = 'top' | 'right' | 'bottom' | 'left';

// =============================================================================
// Constants
// =============================================================================

const ANCHOR_POSITIONS: AnchorPosition[] = ['top', 'right', 'bottom', 'left'];

const PORT_COLORS: Record<string, string> = {
  input: '#3b82f6', // blue-500
  output: '#22c55e', // green-500
};

const PORT_DATA_COLORS: Record<string, string> = {
  image: '#f59e0b', // amber-500
  video: '#8b5cf6', // violet-500
  audio: '#ec4899', // pink-500
  text: '#06b6d4', // cyan-500
  any: '#6b7280', // gray-500
};

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
// DeriveButton — "+" with type picker popup
// =============================================================================

const DERIVE_NODE_TYPES: readonly {
  readonly type: CanvasNodeType;
  readonly icon: CodiconName;
  readonly labelKey: string;
}[] = [
  { type: 'shot', icon: 'symbol-color', labelKey: 'node.shot' },
  { type: 'scene', icon: 'symbol-structure', labelKey: 'node.sceneGroup' },
  { type: 'gallery', icon: 'symbol-misc', labelKey: 'node.gallery' },
  { type: 'media', icon: 'symbol-misc', labelKey: 'node.media' },
  { type: 'annotation', icon: 'edit', labelKey: 'node.note' },
] as const;

function DeriveButton({ sourceNodeId }: { sourceNodeId: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const allowedTypes = useMemo(() => {
    const node = useCanvasStore.getState().canvasData?.nodes.find((n) => n.id === sourceNodeId);
    if (!node) return DERIVE_NODE_TYPES;
    const presetName = node.preset ?? getDefaultCanvasNodePresetName(node.type);
    const preset = getBuiltInCanvasNodePresetMetadata(presetName);
    if (!preset) return DERIVE_NODE_TYPES;
    const targetNodeTypes = new Set<string>();
    for (const t of preset.deriveTargets) {
      const p = getBuiltInCanvasNodePresetMetadata(t);
      if (p) targetNodeTypes.add(p.nodeType);
    }
    return DERIVE_NODE_TYPES.filter(({ type }) => targetNodeTypes.has(type));
  }, [sourceNodeId]);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleDown, true);
    return () => document.removeEventListener('pointerdown', handleDown, true);
  }, [open]);

  if (allowedTypes.length === 0) return null;

  return (
    <div
      className="absolute z-30 derive-btn"
      style={{ right: -16, top: '50%', transform: 'translateY(-50%)' }}
    >
      <button
        className="flex items-center justify-center rounded-full"
        style={{
          width: 28,
          height: 28,
          backgroundColor: 'var(--node-selected, #3b82f6)',
          color: '#fff',
          border: '2px solid var(--node-bg, #1e1e1e)',
          fontSize: 16,
          fontWeight: 'bold',
          lineHeight: 1,
          cursor: 'pointer',
        }}
        title="添加后继节点"
        onMouseDown={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        +
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute rounded-lg shadow-xl py-1"
          style={{
            left: 30,
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: 'var(--node-bg, #1e1e1e)',
            border: '1px solid var(--node-border, #333)',
            whiteSpace: 'nowrap',
            minWidth: 100,
          }}
        >
          {allowedTypes.map(({ type, icon, labelKey }) => (
            <button
              key={type}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
              style={{
                color: 'var(--node-fg, #ccc)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                useCanvasStore.getState().deriveSuccessorNode(sourceNodeId, type);
                setOpen(false);
              }}
            >
              <span className={toCodiconClassName(icon)} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  onMove,
  onResizeEnd,
  onRotateEnd,
  onConnectionStart,
  children,
  className,
  autoSizeContent = true,
  minSize,
  renderHeight,
  presentation = 'structured',
  opaqueSurface = false,
  renderZIndex,
  onActivate,
}: BaseNodeProps) {
  const activePlayingNodeId = useCanvasStore((state) => state.activePlayingNodeId);
  const isPlaybackActive = activePlayingNodeId === node.id;
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
    onDragStart: onTransformStart,
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
  const hasPorts = ports.length > 0;

  // Handle node click for selection
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(node.id, e.shiftKey || e.metaKey);
    },
    [node.id, onSelect],
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

  const getEndpointHandleStyle = (side: AnchorPosition): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: '50%',
      backgroundColor: 'var(--node-border)',
      border: '2px solid var(--node-bg)',
      cursor: 'crosshair',
      zIndex: 10,
    };

    switch (side) {
      case 'top':
        return { ...base, top: -6, left: '50%', transform: 'translateX(-50%)' };
      case 'right':
        return { ...base, right: -6, top: '50%', transform: 'translateY(-50%)' };
      case 'bottom':
        return { ...base, bottom: -6, left: '50%', transform: 'translateX(-50%)' };
      case 'left':
        return { ...base, left: -6, top: '50%', transform: 'translateY(-50%)' };
    }
  };

  // Get port position styles
  const getPortStyle = (
    port: PortDefinition,
    index: number,
    totalOnSide: number,
  ): React.CSSProperties => {
    const portColor = PORT_DATA_COLORS[port.dataType ?? 'any'] ?? PORT_COLORS[port.type];
    const base: React.CSSProperties = {
      position: 'absolute',
      width: 14,
      height: 14,
      borderRadius: '50%',
      backgroundColor: portColor,
      border: '2px solid var(--node-bg)',
      cursor: 'crosshair',
      zIndex: 10,
    };

    // Calculate offset for multiple ports on the same side
    const spacing = 100 / (totalOnSide + 1);
    const percent = `${spacing * (index + 1)}%`;

    switch (port.position) {
      case 'top':
        return { ...base, top: -7, left: percent, transform: 'translateX(-50%)' };
      case 'right':
        return { ...base, right: -7, top: percent, transform: 'translateY(-50%)' };
      case 'bottom':
        return { ...base, bottom: -7, left: percent, transform: 'translateX(-50%)' };
      case 'left':
        return { ...base, left: -7, top: percent, transform: 'translateY(-50%)' };
    }
  };

  // Group ports by side for spacing calculation
  const portsBySide = new Map<string, { port: PortDefinition; index: number }[]>();
  for (const port of ports) {
    const side = port.position;
    if (!portsBySide.has(side)) {
      portsBySide.set(side, []);
    }
    const sideList = portsBySide.get(side)!;
    sideList.push({ port, index: sideList.length });
  }

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
      data-playback-active={isPlaybackActive ? 'true' : undefined}
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
      onMouseDown={dragHandlers.onMouseDown}
      onClick={handleClick}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onActivate?.(node.id);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(node.id, event.shiftKey || event.metaKey);
        }
      }}
      tabIndex={0}
      role="group"
      aria-label={`${node.type} ${node.id}`}
    >
      {/* Node content */}
      <div
        ref={contentRef}
        className={clsx(
          'node-card w-full h-full overflow-hidden',
          `node-card--${presentation}`,
          opaqueSurface && 'node-card--opaque',
          'transition-colors duration-150',
          (isSelected || isPlaybackActive) && 'selected',
          isPlaybackActive && !isSelected && 'ring-2 ring-[var(--node-selected)] ring-offset-2',
          (isDragging || isResizing) && 'shadow-2xl',
        )}
      >
        {children}
      </div>

      {/* Derive successor node — "+" button with type picker */}
      {!node.locked && <DeriveButton sourceNodeId={node.id} />}

      {/* Resize handles (visible when selected) */}
      {isSelected &&
        !node.locked &&
        RESIZE_HANDLES.map(({ handle, cursor, style }) => (
          <div
            key={handle}
            className="absolute z-20"
            style={{ ...style, cursor, position: 'absolute' }}
            onMouseDown={(e) => {
              onTransformStart?.(node.id);
              startResize(handle, e);
            }}
          />
        ))}

      {/* Rotation handle (visible when selected, above node top center) */}
      {isSelected && !node.locked && (
        <>
          {/* Connector line from node top to rotation handle */}
          <div
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
            title={`Rotation: ${Math.round(currentRotation)}°`}
          >
            ↻
          </div>
        </>
      )}

      {/* Port-based connections (always visible for data flow clarity) */}
      {hasPorts &&
        Array.from(portsBySide.entries()).map(([_side, portsOnSide]) =>
          portsOnSide.map(({ port, index }) => (
            <div
              key={port.id}
              data-port-id={port.id}
              data-port-type={port.type}
              data-node-id={node.id}
              data-connection-handle={port.id}
              style={getPortStyle(port, index, portsOnSide.length)}
              onMouseDown={handleAnchorMouseDown(port.id)}
              className={clsx(
                'transition-all duration-150',
                isSelected
                  ? 'scale-110 opacity-100'
                  : 'scale-75 opacity-60 hover:scale-110 hover:opacity-100',
              )}
              title={port.label ?? `${port.type}: ${port.dataType ?? 'any'}`}
            >
              {/* Port type indicator: input has inner dot, output is solid */}
              {port.type === 'input' && (
                <div
                  className="absolute inset-[3px] rounded-full"
                  style={{ backgroundColor: 'var(--node-bg)' }}
                />
              )}
            </div>
          )),
        )}

      {/* Node-level endpoint handles (only when selected) */}
      {!hasPorts &&
        isSelected &&
        ANCHOR_POSITIONS.map((side) => (
          <div
            key={side}
            data-node-id={node.id}
            data-connection-handle={side}
            style={getEndpointHandleStyle(side)}
            onMouseDown={handleAnchorMouseDown(side)}
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

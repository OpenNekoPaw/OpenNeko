/**
 * ConnectionLayer - Connection layer component
 * Manages rendering of all connections and pending connection preview.
 *
 * Supports endpoint-based connections and pending handle previews.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { CanvasConnection, CanvasNode, PortDefinition } from '@neko/shared';
import { getDefaultPorts } from '@neko/shared';
import { Connection } from './Connection';
import {
  projectCanvasConnectionView,
  type CanvasConnectionRenderBounds,
} from '../../utils/connectionProjection';
import {
  resolveAggregateConnectionCountLabel,
  resolveInternalConnectionCountLabel,
} from '../../i18n/connectionLabels';

// =============================================================================
// Types
// =============================================================================

export interface ConnectionLayerProps {
  connections: CanvasConnection[];
  nodes: CanvasNode[];
  selectedConnectionIds: string[];
  visibleNodeIds?: readonly string[];
  expandedContainerIds?: readonly string[];
  renderBounds?: CanvasConnectionRenderBounds[];
  freezeProjection?: boolean;
  pendingConnection?: {
    sourceNodeId: string;
    sourceHandleId: string;
    mousePosition: { x: number; y: number };
  } | null;
  onConnectionSelect?: (connectionId: string) => void;
}

interface Point {
  x: number;
  y: number;
}

// =============================================================================
// Constants
// =============================================================================

const SVG_OFFSET = 50000;
const SVG_SIZE = 100000;

// =============================================================================
// Helpers
// =============================================================================

function getNodeSidePoint(node: CanvasNode, side: string): Point {
  const { position, size } = node;

  switch (side) {
    case 'top':
      return { x: position.x + size.width / 2, y: position.y };
    case 'right':
      return { x: position.x + size.width, y: position.y + size.height / 2 };
    case 'bottom':
      return { x: position.x + size.width / 2, y: position.y + size.height };
    case 'left':
      return { x: position.x, y: position.y + size.height / 2 };
    default:
      return { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  }
}

/**
 * Get the anchor point for a port-based connection.
 * Calculates position based on port side and index among ports on the same side.
 */
function getPortAnchorPoint(node: CanvasNode, portId: string): Point | null {
  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === portId);
  if (!port) return null;

  // Count ports on the same side and find index
  const portsOnSide = ports.filter((p: PortDefinition) => p.position === port.position);
  const index = portsOnSide.indexOf(port);
  const total = portsOnSide.length;

  const { position, size } = node;
  const spacing = 1 / (total + 1);
  const fraction = spacing * (index + 1);

  switch (port.position) {
    case 'top':
      return { x: position.x + size.width * fraction, y: position.y };
    case 'right':
      return { x: position.x + size.width, y: position.y + size.height * fraction };
    case 'bottom':
      return { x: position.x + size.width * fraction, y: position.y + size.height };
    case 'left':
      return { x: position.x, y: position.y + size.height * fraction };
    default:
      return null;
  }
}

function getHandlePoint(node: CanvasNode, handleId: string, portId?: string): Point {
  if (portId) {
    const portPoint = getPortAnchorPoint(node, portId);
    if (portPoint) return portPoint;
  }

  const portPoint = getPortAnchorPoint(node, handleId);
  if (portPoint) return portPoint;

  return getNodeSidePoint(node, handleId);
}

function getHandleDirection(node: CanvasNode, handleId: string, portId?: string): string {
  if (portId) {
    const ports = node.ports ?? getDefaultPorts(node.type);
    const port = ports.find((p: PortDefinition) => p.id === portId);
    if (port) return port.position;
  }

  const ports = node.ports ?? getDefaultPorts(node.type);
  const port = ports.find((p: PortDefinition) => p.id === handleId);
  if (port) return port.position;

  return handleId;
}

function getControlPoint(point: Point, anchor: string, offset: number): Point {
  switch (anchor) {
    case 'top':
      return { x: point.x, y: point.y - offset };
    case 'right':
      return { x: point.x + offset, y: point.y };
    case 'bottom':
      return { x: point.x, y: point.y + offset };
    case 'left':
      return { x: point.x - offset, y: point.y };
    default:
      return point;
  }
}

// =============================================================================
// Component
// =============================================================================

export function ConnectionLayer({
  connections,
  nodes,
  selectedConnectionIds,
  visibleNodeIds,
  expandedContainerIds,
  renderBounds,
  freezeProjection = false,
  pendingConnection,
  onConnectionSelect,
}: ConnectionLayerProps) {
  // Create node lookup map for performance
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const latestProjectionRef = useRef<ReturnType<typeof projectCanvasConnectionView> | null>(null);
  const projection = useMemo(() => {
    if (freezeProjection && latestProjectionRef.current) {
      return latestProjectionRef.current;
    }

    return projectCanvasConnectionView({
      nodes,
      connections,
      visibleNodeIds,
      expandedContainerIds,
      renderBounds,
    });
  }, [connections, expandedContainerIds, freezeProjection, nodes, renderBounds, visibleNodeIds]);

  useEffect(() => {
    if (!freezeProjection) {
      latestProjectionRef.current = projection;
    }
  }, [freezeProjection, projection]);

  // Render pending connection preview
  const renderPendingConnection = () => {
    if (!pendingConnection) return null;

    const sourceNode = nodeMap.get(pendingConnection.sourceNodeId);
    if (!sourceNode) return null;

    const sourcePoint = getHandlePoint(sourceNode, pendingConnection.sourceHandleId);
    const sourceDir = getHandleDirection(sourceNode, pendingConnection.sourceHandleId);
    const targetPoint = pendingConnection.mousePosition;

    // Calculate control points
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlOffset = Math.min(distance / 2, 100) + 30;

    const cp1 = getControlPoint(sourcePoint, sourceDir, controlOffset);
    // For pending connection, use a simple offset toward the target
    const cp2 = {
      x: targetPoint.x - (dx > 0 ? controlOffset : -controlOffset) * 0.5,
      y: targetPoint.y - (dy > 0 ? controlOffset : -controlOffset) * 0.5,
    };

    const pathD = `M ${sourcePoint.x + SVG_OFFSET} ${sourcePoint.y + SVG_OFFSET} C ${cp1.x + SVG_OFFSET} ${cp1.y + SVG_OFFSET}, ${cp2.x + SVG_OFFSET} ${cp2.y + SVG_OFFSET}, ${targetPoint.x + SVG_OFFSET} ${targetPoint.y + SVG_OFFSET}`;

    return (
      <g className="pending-connection">
        <path
          d={pathD}
          fill="none"
          stroke="var(--node-selected)"
          strokeWidth={2}
          strokeDasharray="5,5"
          opacity={0.7}
        />
        {/* Target indicator */}
        <circle
          cx={targetPoint.x + SVG_OFFSET}
          cy={targetPoint.y + SVG_OFFSET}
          r={6}
          fill="var(--node-selected)"
          opacity={0.5}
        />
      </g>
    );
  };

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        width: `${SVG_SIZE}px`,
        height: `${SVG_SIZE}px`,
        left: `-${SVG_OFFSET}px`,
        top: `-${SVG_OFFSET}px`,
        overflow: 'visible',
      }}
    >
      {/* Offset group to handle coordinate system */}
      <g transform={`translate(${SVG_OFFSET}, ${SVG_OFFSET})`}>
        {projection.directConnections.map((view) => (
          <Connection
            key={view.id}
            connection={view.connection}
            sourceNode={view.sourceNode}
            targetNode={view.targetNode}
            isSelected={selectedConnectionIds.includes(view.connection.id)}
            onSelect={onConnectionSelect}
          />
        ))}
        {projection.aggregateConnections.map((view) => (
          <g key={view.id} className="connection-aggregate">
            <Connection
              connection={view.connection}
              sourceNode={view.sourceNode}
              targetNode={view.targetNode}
              isSelected={view.underlyingConnectionIds.some((id) =>
                selectedConnectionIds.includes(id),
              )}
              onSelect={() => onConnectionSelect?.(view.underlyingConnectionIds[0] ?? view.id)}
            />
            {view.count > 1 && (
              <AggregateConnectionBadge
                sourceNode={view.sourceNode}
                targetNode={view.targetNode}
                count={view.count}
              />
            )}
          </g>
        ))}
        {projection.internalSummaries.map((summary) => {
          const container = nodeMap.get(summary.containerId);
          if (!container || summary.count === 0) return null;
          return (
            <InternalConnectionBadge key={summary.id} node={container} count={summary.count} />
          );
        })}
      </g>

      {/* Pending connection (outside offset group as it uses mouse coordinates) */}
      {renderPendingConnection()}
    </svg>
  );
}

function AggregateConnectionBadge({
  sourceNode,
  targetNode,
  count,
}: {
  sourceNode: CanvasNode;
  targetNode: CanvasNode;
  count: number;
}) {
  const x =
    (sourceNode.position.x +
      sourceNode.size.width / 2 +
      targetNode.position.x +
      targetNode.size.width / 2) /
    2;
  const y =
    (sourceNode.position.y +
      sourceNode.size.height / 2 +
      targetNode.position.y +
      targetNode.size.height / 2) /
    2;

  const label = resolveAggregateConnectionCountLabel(count);

  return (
    <g
      className="connection-aggregate-badge"
      role="img"
      aria-label={label}
      style={{ pointerEvents: 'none' }}
    >
      <title>{label}</title>
      <circle cx={x} cy={y} r={10} fill="var(--node-bg)" stroke="var(--connection-reference)" />
      <text
        x={x}
        y={y + 3}
        textAnchor="middle"
        fill="var(--toolbar-fg)"
        fontSize={9}
        fontFamily="var(--vscode-font-family)"
      >
        {count}
      </text>
    </g>
  );
}

function InternalConnectionBadge({ node, count }: { node: CanvasNode; count: number }) {
  const x = node.position.x + node.size.width - 14;
  const y = node.position.y + 14;
  const label = resolveInternalConnectionCountLabel(count);

  return (
    <g
      className="connection-internal-badge"
      role="img"
      aria-label={label}
      style={{ pointerEvents: 'none' }}
    >
      <title>{label}</title>
      <rect
        x={x - 10}
        y={y - 9}
        width={20}
        height={18}
        rx={4}
        fill="var(--node-bg)"
        stroke="var(--connection-default)"
        opacity={0.95}
      />
      <text
        x={x}
        y={y + 3}
        textAnchor="middle"
        fill="var(--toolbar-fg)"
        fontSize={9}
        fontFamily="var(--vscode-font-family)"
      >
        {count}
      </text>
    </g>
  );
}

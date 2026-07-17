/**
 * Connection - Single connection component
 * Renders a bezier curve with directional arrow and data-type coloring.
 *
 * Supports endpoint-based node and port connections.
 * Enhanced with:
 * - Directional arrow markers
 * - Data-type-based coloring
 * - Animated flow effect
 * - Port-aware anchor calculation
 */

import { useMemo } from 'react';
import type { CanvasConnection, CanvasNode } from '@neko/shared';
import { findCanvasNodePort } from '@neko/shared';
import { getConnectionPathGeometry } from './connectionGeometry';
import { resolveConnectionTitle } from '../../i18n/connectionLabels';

// =============================================================================
// Types
// =============================================================================

export interface ConnectionProps {
  connection: CanvasConnection;
  sourceNode: CanvasNode;
  targetNode: CanvasNode;
  isSelected?: boolean;
  onSelect?: (connectionId: string) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Color mapping for port data types */
const DATA_TYPE_COLORS: Record<string, string> = {
  image: '#f59e0b', // amber
  video: '#8b5cf6', // violet
  audio: '#ec4899', // pink
  text: '#06b6d4', // cyan
  any: '#6b7280', // gray
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Resolve connection color based on port data type or connection type.
 */
function resolveConnectionColor(
  connection: CanvasConnection,
  sourceNode: CanvasNode,
  _targetNode: CanvasNode,
): string {
  const sourcePortId =
    connection.sourceEndpoint.scope === 'port' ? connection.sourceEndpoint.portId : undefined;
  if (sourcePortId) {
    const port = findCanvasNodePort(sourceNode, sourcePortId);
    if (port?.dataType && DATA_TYPE_COLORS[port.dataType]) {
      return DATA_TYPE_COLORS[port.dataType]!;
    }
  }

  // Fall back to connection type
  switch (connection.type) {
    case 'sequence':
      return 'var(--connection-sequence)';
    case 'reference':
      return 'var(--connection-reference)';
    case 'choice':
      return 'var(--connection-choice)';
    case 'transition':
      return 'var(--connection-transition)';
    case 'association':
    case 'derived-from':
      return 'var(--connection-association)';
    default:
      return 'var(--connection-default)';
  }
}

// =============================================================================
// Component
// =============================================================================

export function Connection({
  connection,
  sourceNode,
  targetNode,
  isSelected = false,
  onSelect,
}: ConnectionProps) {
  // Unique ID for arrow marker
  const markerId = `arrow-${sanitizeSvgId(connection.id)}`;

  // Calculate path data
  const pathData = useMemo(
    () => getConnectionPathGeometry(connection, sourceNode, targetNode),
    [connection, sourceNode, targetNode],
  );

  const strokeColor = resolveConnectionColor(connection, sourceNode, targetNode);
  const strokeWidth = isSelected ? 2.5 : 1.8;
  const title = resolveConnectionTitle(connection, sourceNode, targetNode);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(connection.id);
  };

  return (
    <g className="connection-group" role="img" aria-label={title}>
      <title>{title}</title>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 8 3 L 0 6 Z" fill={strokeColor} opacity={isSelected ? 1 : 0.8} />
        </marker>
      </defs>

      {/* Invisible wider path for easier clicking */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={handleClick}
      />

      {/* Glow effect for selected */}
      {isSelected && (
        <path
          d={pathData.pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 4}
          strokeOpacity={0.15}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Visible connection path with arrow */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={connection.type === 'reference' ? '6,4' : undefined}
        strokeOpacity={isSelected ? 1 : 0.7}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: 'none' }}
      />

      {/* Animated flow dots (visible when selected or hovered) */}
      <circle r={3} fill={strokeColor} opacity={0.9}>
        <animateMotion dur="2s" repeatCount="indefinite" path={pathData.pathD} />
      </circle>

      {/* Connection label */}
      {connection.label && (
        <g>
          <rect
            x={pathData.midX - 30}
            y={pathData.midY - 10}
            width={60}
            height={18}
            rx={4}
            fill="var(--node-bg)"
            stroke={strokeColor}
            strokeWidth={1}
            opacity={0.9}
          />
          <text
            x={pathData.midX}
            y={pathData.midY + 3}
            textAnchor="middle"
            fill="var(--toolbar-fg)"
            fontSize={10}
            fontFamily="var(--vscode-font-family)"
            style={{ pointerEvents: 'none' }}
          >
            {connection.label}
          </text>
        </g>
      )}

      {/* Source/target port dots */}
      <circle
        cx={pathData.sourcePoint.x}
        cy={pathData.sourcePoint.y}
        r={isSelected ? 4 : 3}
        fill={strokeColor}
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={pathData.targetPoint.x}
        cy={pathData.targetPoint.y}
        r={isSelected ? 4 : 3}
        fill={strokeColor}
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}

function sanitizeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

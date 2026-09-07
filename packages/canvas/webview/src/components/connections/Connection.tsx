/**
 * Connection - Single connection component
 * Renders one neutral relationship line. Sequence is the only connection kind
 * that adds a direction marker.
 */

import { useMemo } from 'react';
import type { CanvasConnection, CanvasNode } from '@neko/canvas-domain';
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

  const strokeColor = 'var(--connection-default)';
  const strokeWidth = isSelected ? 2 : 1.25;
  const strokeOpacity = isSelected ? 0.88 : connection.type === 'sequence' ? 0.54 : 0.38;
  const title = resolveConnectionTitle(connection, sourceNode, targetNode);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(connection.id);
  };

  return (
    <g
      className="connection-group"
      data-selected={isSelected ? 'true' : 'false'}
      data-connection-type={connection.type}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {connection.type === 'sequence' ? (
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
            <path
              className="connection-arrow"
              d="M 0 0 L 8 3 L 0 6 Z"
              fill={strokeColor}
              opacity={isSelected ? 0.88 : 0.54}
            />
          </marker>
        </defs>
      ) : null}

      {/* Invisible wider path for easier clicking */}
      <path
        d={pathData.pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={handleClick}
      />

      {/* Selection remains a restrained emphasis, not an execution state. */}
      {isSelected && (
        <path
          d={pathData.pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 3}
          strokeOpacity={0.1}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Visible relation line; only sequence communicates order. */}
      <path
        className="connection-line"
        d={pathData.pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        markerEnd={connection.type === 'sequence' ? `url(#${markerId})` : undefined}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}

function sanitizeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

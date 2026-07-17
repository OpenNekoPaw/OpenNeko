/**
 * KeyframeDiamond — Shared diamond-shaped keyframe marker.
 *
 * Visual pattern adapted from neko-cut's KeyframeIndicator.
 * Used inside KeyframeTimeline track rows.
 *
 * CSS class `.neko-keyframe-diamond` is styled via Tailwind.
 */

import React, { useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface KeyframeDiamondProps {
  /** Whether this keyframe is selected */
  selected?: boolean;
  /** Whether multiple keyframes share this time position */
  multi?: boolean;
  /** Horizontal position (CSS left in pixels) */
  left: number;
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void;
  /** Double-click handler */
  onDoubleClick?: (e: React.MouseEvent) => void;
  /** Drag start handler (for time repositioning) */
  onDragStart?: (e: React.PointerEvent) => void;
  /** Tooltip text */
  title?: string;
  /** Additional class name */
  className?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DIAMOND_SIZE = 10; // px (visual size of the diamond)

// ── Component ────────────────────────────────────────────────────────────────

export function KeyframeDiamond({
  selected = false,
  multi = false,
  left,
  onClick,
  onDoubleClick,
  onDragStart,
  title,
  className,
}: KeyframeDiamondProps) {
  const elRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle primary button
      if (e.button !== 0) return;
      onDragStart?.(e);
    },
    [onDragStart],
  );

  const bgColor = selected ? 'var(--neko-accent, #0a84ff)' : 'var(--neko-fg-tertiary, #636366)';

  return (
    <div
      ref={elRef}
      className={`neko-keyframe-diamond${className ? ` ${className}` : ''}`}
      style={{
        position: 'absolute',
        left: left - DIAMOND_SIZE / 2,
        top: '50%',
        width: DIAMOND_SIZE,
        height: DIAMOND_SIZE,
        transform: 'translateY(-50%) rotate(45deg)',
        backgroundColor: bgColor,
        border: selected ? '1px solid var(--neko-accent-bright, #409cff)' : '1px solid transparent',
        cursor: 'pointer',
        zIndex: selected ? 2 : 1,
        transition: 'background-color 0.1s',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={handlePointerDown}
      title={title}
    >
      {multi && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 3,
            height: 3,
            borderRadius: '50%',
            backgroundColor: 'var(--neko-bg, #1c1c1e)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
}

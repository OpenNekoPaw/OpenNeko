import React, { useCallback } from 'react';

export interface KeyframeDiamondProps {
  readonly selected?: boolean;
  readonly multi?: boolean;
  readonly left: number;
  readonly onClick?: (event: React.MouseEvent) => void;
  readonly onDoubleClick?: (event: React.MouseEvent) => void;
  readonly onDragStart?: (event: React.PointerEvent) => void;
  readonly title?: string;
  readonly className?: string;
}

const DIAMOND_SIZE = 10;

export function KeyframeDiamond({
  className,
  left,
  multi = false,
  onClick,
  onDoubleClick,
  onDragStart,
  selected = false,
  title,
}: KeyframeDiamondProps): React.ReactElement {
  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      onDragStart?.(event);
    },
    [onDragStart],
  );

  const bgColor = selected ? 'var(--neko-accent, #0a84ff)' : 'var(--neko-fg-tertiary, #636366)';

  return (
    <div
      className={className ? `neko-keyframe-diamond ${className}` : 'neko-keyframe-diamond'}
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
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={handlePointerDown}
    >
      {multi ? (
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
      ) : null}
    </div>
  );
}

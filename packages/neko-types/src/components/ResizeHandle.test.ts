import { describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from './ResizeHandle';
import type { ResizeHandleBindings } from './useResizable';

describe('ResizeHandle', () => {
  it('preserves caller className and static separator ARIA props', () => {
    const handleProps: ResizeHandleBindings = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onPointerCancel: vi.fn(),
      onLostPointerCapture: vi.fn(),
      role: 'separator',
      'aria-orientation': 'vertical',
      style: {
        cursor: 'ew-resize',
        touchAction: 'none',
      },
    };

    const element = ResizeHandle({ handleProps, className: 'w-1 hover:bg-accent' });

    expect(element.type).toBe('div');
    expect(element.props.className).toBe('w-1 hover:bg-accent');
    expect(element.props.role).toBe('separator');
    expect(element.props['aria-orientation']).toBe('vertical');
    expect(element.props.tabIndex).toBeUndefined();
    expect(element.props['aria-valuenow']).toBeUndefined();
    expect(element.props.style).toEqual({
      cursor: 'ew-resize',
      touchAction: 'none',
    });
  });

  it('merges caller inline style after handle behavior style', () => {
    const handleProps: ResizeHandleBindings = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onPointerCancel: vi.fn(),
      onLostPointerCapture: vi.fn(),
      role: 'separator',
      'aria-orientation': 'horizontal',
      style: {
        cursor: 'ns-resize',
        touchAction: 'none',
      },
    };

    const element = ResizeHandle({
      handleProps,
      style: {
        zIndex: 10,
      },
    });

    expect(element.props.style).toEqual({
      cursor: 'ns-resize',
      touchAction: 'none',
      zIndex: 10,
    });
  });
});

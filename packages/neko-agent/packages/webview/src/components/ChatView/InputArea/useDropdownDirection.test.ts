import { describe, expect, it } from 'vitest';
import { dropdownPositionClass, resolveDropdownPlacement } from './useDropdownDirection';

describe('dropdown placement', () => {
  it('aligns to the trigger end when a menu would overflow the right boundary', () => {
    const placement = resolveDropdownPlacement({
      triggerRect: { top: 420, bottom: 448, left: 342, right: 420 },
      boundaryRect: { top: 0, bottom: 520, left: 0, right: 432 },
      viewportHeight: 520,
      preferredDirection: 'up',
      estimatedWidth: 220,
    });

    expect(placement).toEqual({ direction: 'up', alignment: 'end' });
    expect(dropdownPositionClass(placement)).toBe('bottom-full mb-1 right-0');
  });

  it('keeps start alignment when there is enough room to the right', () => {
    const placement = resolveDropdownPlacement({
      triggerRect: { top: 120, bottom: 148, left: 20, right: 88 },
      boundaryRect: { top: 0, bottom: 520, left: 0, right: 432 },
      viewportHeight: 520,
      preferredDirection: 'down',
      estimatedWidth: 176,
    });

    expect(placement).toEqual({ direction: 'down', alignment: 'start' });
    expect(dropdownPositionClass(placement)).toBe('top-full mt-0.5 left-0');
  });

  it('falls back upward when there is not enough room below', () => {
    const placement = resolveDropdownPlacement({
      triggerRect: { top: 420, bottom: 448, left: 160, right: 240 },
      boundaryRect: { top: 0, bottom: 520, left: 0, right: 432 },
      viewportHeight: 520,
      preferredDirection: 'down',
      estimatedWidth: 176,
    });

    expect(placement.direction).toBe('up');
  });
});

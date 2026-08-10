import { describe, expect, it } from 'vitest';
import { resolveSelectionToolbarTop } from './selectionAttachmentGeometry';

describe('selection attachment geometry', () => {
  it('keeps the toolbar above the external node label at every zoom level', () => {
    expect(resolveSelectionToolbarTop(100, 1, true)).toBe(32);
    expect(resolveSelectionToolbarTop(100, 0.5, true)).toBe(44);
    expect(resolveSelectionToolbarTop(100, 2, true)).toBe(8);
  });

  it('preserves the compact toolbar gap for nodes without an external label', () => {
    expect(resolveSelectionToolbarTop(100, 2, false)).toBe(58);
  });
});

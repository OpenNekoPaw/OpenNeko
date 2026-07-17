import { describe, expect, it } from 'vitest';
import { resolveCanvasPickerAssetKind } from './canvasSourceSelection';

describe('resolveCanvasPickerAssetKind', () => {
  it('routes declared screenplay text away from automatic Script creation', () => {
    expect(resolveCanvasPickerAssetKind('script', 'pilot.fountain')).toBe('text');
    expect(resolveCanvasPickerAssetKind('script', 'pilot.nks')).toBe('text');
  });

  it('routes every supported text selection to the Text path', () => {
    expect(resolveCanvasPickerAssetKind('script', 'notes.md')).toBe('text');
    expect(resolveCanvasPickerAssetKind('script', 'notes.txt')).toBe('text');
  });

  it('does not create text Document assets from generic selection', () => {
    expect(resolveCanvasPickerAssetKind(null, 'notes.md')).toBe('text');
    expect(resolveCanvasPickerAssetKind('document', 'notes.txt')).toBe('text');
  });
});

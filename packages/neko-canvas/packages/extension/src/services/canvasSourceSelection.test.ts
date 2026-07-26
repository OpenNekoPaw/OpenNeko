import { describe, expect, it } from 'vitest';
import { resolveCanvasPickerAssetKind } from './canvasSourceSelection';

describe('resolveCanvasPickerAssetKind', () => {
  it('maps requested File sources to their canonical inferred intent', () => {
    expect(resolveCanvasPickerAssetKind('file', 'pilot.fountain')).toBe('text');
  });

  it('keeps Markdown and plain text as Markdown source intents', () => {
    expect(resolveCanvasPickerAssetKind('file', 'notes.md')).toBe('text');
    expect(resolveCanvasPickerAssetKind('file', 'notes.txt')).toBe('text');
  });

  it('infers canonical source kinds from the selected file', () => {
    expect(resolveCanvasPickerAssetKind(null, 'notes.md')).toBe('text');
    expect(resolveCanvasPickerAssetKind('file', 'notes.txt')).toBe('text');
    expect(resolveCanvasPickerAssetKind('file', 'archive.zip')).toBe('file');
  });
});

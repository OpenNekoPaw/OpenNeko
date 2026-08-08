import { describe, expect, it } from 'vitest';
import {
  createDefaultTextEditorPresentationSnapshot,
  parseTextEditorPresentationSnapshot,
} from './presentation-snapshot';

describe('Text Editor presentation snapshot', () => {
  it('accepts only the package-owned presentation fields', () => {
    const snapshot = {
      mode: 'split',
      selection: { anchor: 10, head: 12 },
      scrollTop: 40,
      splitRatio: 0.6,
      outlineVisible: false,
    } as const;
    expect(parseTextEditorPresentationSnapshot(snapshot)).toEqual({ snapshot });
  });

  it('resets only an invalid snapshot without retaining source authority', () => {
    expect(parseTextEditorPresentationSnapshot({ source: 'secret' })).toEqual({
      snapshot: createDefaultTextEditorPresentationSnapshot(),
      diagnostic: 'text-editor-presentation-snapshot-invalid',
    });
  });
});

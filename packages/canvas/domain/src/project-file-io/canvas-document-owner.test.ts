import { describe, expect, it } from 'vitest';
import { loadNkc } from '../nkc';
import {
  createEmptyCanvasDocumentBytes,
  isValidCanvasDocumentBytes,
} from './canvas-document-owner';

describe('Canvas document owner', () => {
  it('creates canonical valid NKC bytes', () => {
    const bytes = createEmptyCanvasDocumentBytes('Board');
    const loaded = loadNkc(new TextDecoder().decode(bytes));

    expect(loaded.validation.valid).toBe(true);
    expect(loaded.data).toMatchObject({ name: 'Board', nodes: [], connections: [] });
    expect(isValidCanvasDocumentBytes(bytes)).toBe(true);
    expect(isValidCanvasDocumentBytes(new TextEncoder().encode('{}'))).toBe(false);
  });
});

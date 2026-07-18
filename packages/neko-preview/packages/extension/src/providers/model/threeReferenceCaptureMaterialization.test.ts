import { describe, expect, it } from 'vitest';
import { decodePngDataUrl } from './threeReferenceCaptureEncoding';

describe('3D Reference capture materialization', () => {
  it('accepts bounded PNG bytes and rejects mislabeled payloads', () => {
    expect(decodePngDataUrl('data:image/png;base64,iVBORw0KGgo=')).toHaveLength(8);
    expect(() => decodePngDataUrl('data:image/png;base64,AA==')).toThrow(/PNG signature/);
    expect(() => decodePngDataUrl('data:image/jpeg;base64,iVBORw0KGgo=')).toThrow(/not a PNG/);
  });
});

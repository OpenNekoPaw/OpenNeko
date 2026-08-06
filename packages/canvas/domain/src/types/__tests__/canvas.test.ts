import { describe, expect, it } from 'vitest';
import {
  isCanvasNodeType,
  isDocumentResourceStatusReason,
  parseDocumentResourceStatus,
} from '../canvas';

describe('canvas contracts', () => {
  it('registers only canonical Canvas node types', () => {
    for (const type of ['markdown', 'media', 'group', 'job', 'file', 'canvas-embed']) {
      expect(isCanvasNodeType(type)).toBe(true);
    }
    expect(isCanvasNodeType('shot')).toBe(false);
    expect(isCanvasNodeType('narrative-start')).toBe(false);
  });

  it('normalizes document resource status reasons', () => {
    expect(isDocumentResourceStatusReason('cache-missing')).toBe(true);
    expect(isDocumentResourceStatusReason('arbitrary')).toBe(false);
    expect(
      parseDocumentResourceStatus({
        state: 'unavailable',
        reason: 'projection-failed',
        message: 'Preview unavailable',
      }),
    ).toEqual({
      state: 'unavailable',
      reason: 'projection-failed',
      message: 'Preview unavailable',
    });
    expect(
      parseDocumentResourceStatus({
        state: 'unavailable',
        reason: 'arbitrary',
        message: 'Preview unavailable',
      }),
    ).toEqual({
      state: 'unavailable',
      message: 'Preview unavailable',
    });
    expect(parseDocumentResourceStatus({ state: 'ready' })).toBeUndefined();
  });
});

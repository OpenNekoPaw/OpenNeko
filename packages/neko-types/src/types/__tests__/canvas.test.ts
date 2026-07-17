import { describe, expect, it } from 'vitest';
import {
  isCanvasNodeType,
  isDocumentResourceStatusReason,
  parseDocumentResourceStatus,
} from '../canvas';

describe('canvas contracts', () => {
  it('registers narrative start and ending node types', () => {
    expect(isCanvasNodeType('narrative-start')).toBe(true);
    expect(isCanvasNodeType('narrative-ending')).toBe(true);
  });

  it('normalizes document resource status reasons', () => {
    expect(isDocumentResourceStatusReason('cache-missing')).toBe(true);
    expect(isDocumentResourceStatusReason('legacy-cache-fallback')).toBe(false);
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

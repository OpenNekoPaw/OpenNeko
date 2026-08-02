import { describe, expect, it } from 'vitest';
import * as shared from '../index';

describe('@neko/shared main entry boundary', () => {
  it('does not export React UI components from the main entrypoint', () => {
    expect('MacButton' in shared).toBe(false);
    expect('ResizeHandle' in shared).toBe(false);
    expect('useResizable' in shared).toBe(false);
    expect('ContextMenu' in shared).toBe(false);
  });

  it('does not export removed path-only quality normalization contracts', () => {
    expect('normalizeQualityReviewPayload' in shared).toBe(false);
    expect('normalizeQualityConsistencyPayload' in shared).toBe(false);
    expect('buildVideoContentIndex' in shared).toBe(false);
  });
});

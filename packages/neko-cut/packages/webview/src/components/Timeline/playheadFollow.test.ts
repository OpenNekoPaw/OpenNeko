import { describe, expect, it } from 'vitest';
import { nextPlayheadFollowScrollLeft } from './playheadFollow';

describe('Timeline playhead following', () => {
  it('keeps the playhead inside a twenty-percent viewport margin while playing', () => {
    expect(
      nextPlayheadFollowScrollLeft({
        playheadPixels: 950,
        scrollLeft: 0,
        viewportWidth: 1000,
      }),
    ).toBe(150);
    expect(
      nextPlayheadFollowScrollLeft({
        playheadPixels: 500,
        scrollLeft: 0,
        viewportWidth: 1000,
      }),
    ).toBe(0);
  });
});

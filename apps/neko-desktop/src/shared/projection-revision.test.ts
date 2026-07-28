import { describe, expect, it } from 'vitest';
import { advanceDesktopShellProjectionCursor } from './projection-revision';

describe('Desktop Shell projection revision cursor', () => {
  it('keeps the newest mutation context when a command response arrives late', () => {
    const current = {
      endpointEpoch: 'app-1:window-1:1',
      projectionRevision: 4,
      windowRevision: 3,
    };

    expect(
      advanceDesktopShellProjectionCursor(current, {
        endpointEpoch: current.endpointEpoch,
        projectionRevision: 3,
        window: { revision: 2 },
      }),
    ).toBe(current);
  });

  it('advances revisions and rejects another renderer endpoint', () => {
    expect(
      advanceDesktopShellProjectionCursor(undefined, {
        endpointEpoch: 'app-1:window-1:1',
        projectionRevision: 1,
        window: { revision: 0 },
      }),
    ).toEqual({
      endpointEpoch: 'app-1:window-1:1',
      projectionRevision: 1,
      windowRevision: 0,
    });
    expect(() =>
      advanceDesktopShellProjectionCursor(
        {
          endpointEpoch: 'app-1:window-1:1',
          projectionRevision: 1,
          windowRevision: 0,
        },
        {
          endpointEpoch: 'app-1:window-1:2',
          projectionRevision: 1,
          window: { revision: 0 },
        },
      ),
    ).toThrow('endpoint changed');
  });
});

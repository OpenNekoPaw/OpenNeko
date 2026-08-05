import { describe, expect, it } from 'vitest';
import { projectDesktopShellMutationContext } from './shell-mutation-context';

describe('Desktop Shell mutation context', () => {
  it('projects the current Window state for one exact renderer endpoint', () => {
    expect(
      projectDesktopShellMutationContext(undefined, {
        rendererSessionId: 'app-1:window-1:1',
        window: { revision: 3 },
      }),
    ).toEqual({
      rendererSessionId: 'app-1:window-1:1',
      windowRevision: 3,
    });
  });

  it('rejects another renderer endpoint', () => {
    expect(() =>
      projectDesktopShellMutationContext(
        {
          rendererSessionId: 'app-1:window-1:1',
          windowRevision: 0,
        },
        {
          rendererSessionId: 'app-1:window-1:2',
          window: { revision: 0 },
        },
      ),
    ).toThrow('endpoint changed');
  });
});

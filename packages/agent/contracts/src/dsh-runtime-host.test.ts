import { describe, expect, it } from 'vitest';

import {
  parseDshRuntimeHostProjection,
  parseDshRuntimeHostRequest,
  parseDshRuntimeHostResult,
} from './dsh-runtime-host';

describe('DSH runtime Host contract', () => {
  it('accepts the canonical status and restart contract', () => {
    expect(
      parseDshRuntimeHostRequest({
        requestId: 'request-1',
        operation: 'restart',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
      }),
    ).toMatchObject({ operation: 'restart' });
    expect(
      parseDshRuntimeHostRequest({
        requestId: 'request-2',
        operation: 'prepare-session',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
      }),
    ).toMatchObject({ operation: 'prepare-session' });
    expect(
      parseDshRuntimeHostResult(
        { requestId: 'request-1', projection: { status: 'running' } },
        'request-1',
      ),
    ).toEqual({ requestId: 'request-1', projection: { status: 'running' } });
    expect(
      parseDshRuntimeHostProjection({
        status: 'running',
        sessionConfigurationPending: true,
      }),
    ).toEqual({ status: 'running', sessionConfigurationPending: true });
  });

  it('keeps failure diagnostic explicit and rejects unknown fields', () => {
    expect(
      parseDshRuntimeHostProjection({
        status: 'unavailable',
        diagnostic: {
          code: 'desktop-dsh-runtime-restart-failed',
          message: 'ACP handshake rejected.',
        },
      }),
    ).toMatchObject({ status: 'unavailable' });
    expect(() => parseDshRuntimeHostProjection({ status: 'running', sequence: 2 })).toThrow(
      /unexpected=sequence/u,
    );
    expect(() =>
      parseDshRuntimeHostProjection({
        status: 'running',
        sessionConfigurationPending: false,
      }),
    ).toThrow(/must be true/u);
    expect(() =>
      parseDshRuntimeHostProjection({
        status: 'unavailable',
        diagnostic: { code: 'unexpected-runtime-state', message: 'unsupported state' },
      }),
    ).toThrow(/diagnostic/u);
  });
});

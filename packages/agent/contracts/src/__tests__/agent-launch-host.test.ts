import { describe, expect, it } from 'vitest';
import {
  AGENT_LAUNCH_CONTRACT_VERSION,
  parseAgentLaunchHostRequest,
  parseAgentLaunchHostResult,
} from '../agent-launch-host';

describe('Agent launch Host contract', () => {
  it('parses exact attach and authorization requests without Window or path authority', () => {
    const attach = parseAgentLaunchHostRequest({
      schemaVersion: AGENT_LAUNCH_CONTRACT_VERSION,
      requestId: 'attach-1',
      operation: 'attach',
      viewId: 'agent-view:window-1',
      scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
    });
    expect(attach).toMatchObject({ operation: 'attach', viewId: 'agent-view:window-1' });
    expect(JSON.stringify(attach)).not.toContain('windowId');
    expect(() =>
      parseAgentLaunchHostRequest({
        ...attach,
        absolutePath: '/Users/private',
      }),
    ).toThrow('unsupported fields');
  });

  it('fences responses by request identity and parses cancellation explicitly', () => {
    expect(
      parseAgentLaunchHostResult(
        {
          schemaVersion: 1,
          requestId: 'authorize-1',
          status: 'cancelled',
        },
        'authorize-1',
      ),
    ).toEqual({ schemaVersion: 1, requestId: 'authorize-1', status: 'cancelled' });
    expect(() =>
      parseAgentLaunchHostResult(
        { schemaVersion: 1, requestId: 'stale', status: 'detached' },
        'current',
      ),
    ).toThrow('request identity mismatch');
  });
});

import { describe, expect, it } from 'vitest';
import { parseAgentLaunchHostRequest, parseAgentLaunchHostResult } from '../agent-launch-host';

describe('Agent launch Host contract', () => {
  it('parses exact attach and authorization requests without Window or path authority', () => {
    const attach = parseAgentLaunchHostRequest({
      requestId: 'attach-1',
      operation: 'attach',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
    });
    expect(attach).toMatchObject({
      operation: 'attach',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
    });
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
          requestId: 'authorize-1',
          status: 'cancelled',
        },
        'authorize-1',
      ),
    ).toEqual({ requestId: 'authorize-1', status: 'cancelled' });
    expect(() =>
      parseAgentLaunchHostResult({ requestId: 'stale', status: 'detached' }, 'current'),
    ).toThrow('request identity mismatch');
  });
});

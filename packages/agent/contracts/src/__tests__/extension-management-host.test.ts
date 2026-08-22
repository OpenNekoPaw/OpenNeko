import { describe, expect, it } from 'vitest';
import {
  createAgentExtensionManagementHostRequest,
  parseAgentExtensionManagementHostResult,
} from '../extension-management-host';

const identity = { windowId: 'window-1' };

function projection() {
  return {
    identity,
    skills: [
      {
        id: 'dsh-skill:storyboard',
        name: 'storyboard',
        description: 'Create a storyboard.',
        source: 'bundled',
        provider: 'openneko-builtin',
        userInvocable: true,
        modelInvocable: true,
      },
    ],
    mcp: [],
    diagnostics: [],
  };
}

describe('DSH extension management contract', () => {
  it('accepts only the read-only snapshot command', () => {
    expect(
      createAgentExtensionManagementHostRequest({
        requestId: 'request-1',
        identity,
        route: 'snapshot.get',
      }),
    ).toEqual({ requestId: 'request-1', identity, route: 'snapshot.get' });
    expect(() =>
      createAgentExtensionManagementHostRequest({
        requestId: 'request-2',
        identity,
        route: 'plugin.enable',
      } as never),
    ).toThrow('Unknown DSH extension management route');
  });

  it('rejects a stale owner while preserving the canonical empty MCP catalog', () => {
    const request = createAgentExtensionManagementHostRequest({
      requestId: 'request-3',
      identity,
      route: 'snapshot.get',
    });
    expect(
      parseAgentExtensionManagementHostResult(
        { requestId: request.requestId, route: request.route, projection: projection() },
        request,
      ).projection.mcp,
    ).toEqual([]);
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          projection: { ...projection(), identity: { windowId: 'window-2' } },
        },
        request,
      ),
    ).toThrow('owner identity is stale');
  });

  it('rejects Plugin inventory from the Skill/MCP-only projection', () => {
    const request = createAgentExtensionManagementHostRequest({
      requestId: 'request-4',
      identity,
      route: 'snapshot.get',
    });
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          projection: { ...projection(), plugins: [] },
        },
        request,
      ),
    ).toThrow('DSH extension management projection is invalid.');
  });
});

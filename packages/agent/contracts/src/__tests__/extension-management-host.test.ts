import { describe, expect, it } from 'vitest';
import {
  createAgentExtensionManagementHostRequest,
  parseAgentExtensionManagementHostResult,
} from '../extension-management-host';

const identity = { windowId: 'window-1' };

function projection() {
  return {
    identity,
    catalogScope: 'global' as const,
    skills: [
      {
        id: 'dsh-skill:storyboard',
        name: 'storyboard',
        description: 'Create a storyboard.',
        source: 'bundled',
        provider: 'openneko-builtin',
        userInvocable: true,
        modelInvocable: true,
        enabled: true,
        manageable: false,
        removable: false,
      },
    ],
    mcp: [],
    diagnostics: [],
  };
}

describe('DSH extension management contract', () => {
  it('accepts the canonical lifecycle routes and rejects unknown Plugin commands', () => {
    expect(
      createAgentExtensionManagementHostRequest({
        requestId: 'request-1',
        identity,
        route: 'snapshot.get',
      }),
    ).toEqual({ requestId: 'request-1', identity, route: 'snapshot.get' });
    expect(
      createAgentExtensionManagementHostRequest({
        requestId: 'request-skill',
        identity,
        route: 'skill.enablement.update',
        name: 'review',
        source: 'user-dsh',
        enabled: false,
      }),
    ).toEqual({
      requestId: 'request-skill',
      identity,
      route: 'skill.enablement.update',
      name: 'review',
      source: 'user-dsh',
      enabled: false,
    });
    expect(
      createAgentExtensionManagementHostRequest({
        requestId: 'request-mcp',
        identity,
        route: 'mcp.add',
        server: {
          serverName: 'filesystem',
          description: 'Approved files',
          transport: 'stdio',
          command: 'mcp-filesystem',
          args: ['--readonly'],
        },
      }).route,
    ).toBe('mcp.add');
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

  it.each(['path', 'resourceBase', 'content', 'metadata'])(
    'rejects private Skill field %s from the Renderer projection',
    (field) => {
      const request = createAgentExtensionManagementHostRequest({
        requestId: `request-private-${field}`,
        identity,
        route: 'snapshot.get',
      });
      const [skill] = projection().skills;
      if (skill === undefined) throw new Error('Skill projection fixture is empty.');

      expect(() =>
        parseAgentExtensionManagementHostResult(
          {
            requestId: request.requestId,
            route: request.route,
            projection: {
              ...projection(),
              skills: [{ ...skill, [field]: field === 'metadata' ? {} : '/private/value' }],
            },
          },
          request,
        ),
      ).toThrow('DSH Skill item is invalid.');
    },
  );
});

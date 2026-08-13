import { describe, expect, it } from 'vitest';
import {
  createAgentExtensionManagementHostRequest,
  parseAgentExtensionManagementHostRequest,
  parseAgentExtensionManagementHostResult,
} from '../extension-management-host';

const identity = {
  windowId: 'window-1',
};

function createRequest() {
  return createAgentExtensionManagementHostRequest({
    route: 'snapshot.get',
    requestId: 'extensions-1',
    identity,
  });
}

function createProjection() {
  return {
    identity,
    skills: [
      {
        id: 'personal:personal:story-planner',
        name: 'story-planner',
        description: 'Plan a story.',
        source: 'personal',
        sourceId: 'personal',
        managementId: `skill:${'b'.repeat(64)}`,
        canOpenInEditor: true,
        canShowInFolder: true,
        canRemove: true,
      },
    ],
    skillDiscovery: {
      diagnostics: [{ code: 'invalid_metadata', source: 'personal', count: 1 }],
      duplicateCount: 0,
    },
    extensions: [
      {
        id: 'computer-use',
        name: 'computer-use',
        displayName: 'Computer Use',
        description: 'Control Mac apps.',
        localization: {
          'zh-cn': { description: '控制 Mac 应用。' },
        },
        version: '1.0.2',
        developer: 'OpenAI',
        enabled: true,
        canEnable: false,
        canDisable: true,
        canRemove: false,
        deliverySource: 'bundled',
        agentStatus: 'ready',
        runtimeDiagnosticCode: '',
        componentReadiness: {
          skills: { status: 'ready', diagnosticCode: '' },
          mcp: { status: 'ready', diagnosticCode: '' },
          apps: { status: 'absent', diagnosticCode: '' },
        },
        iconDataUrl: '',
        mcpServerIds: ['computer-use'],
        hasSkills: true,
        appIds: [],
      },
    ],
    extensionDiscovery: { diagnostics: [{ code: 'runtime_failed', count: 1 }] },
  };
}

describe('Agent Extension Management Host contract', () => {
  it('parses exact owner-qualified requests and projections', () => {
    const request = createRequest();
    expect(parseAgentExtensionManagementHostRequest(request)).toEqual(request);
    expect(
      createAgentExtensionManagementHostRequest({
        route: 'sources.rescan',
        requestId: 'extensions-rescan-1',
        identity,
      }),
    ).toMatchObject({ route: 'sources.rescan' });
    expect(
      createAgentExtensionManagementHostRequest({
        route: 'plugin.install',
        requestId: 'extensions-install-1',
        identity,
      }),
    ).toMatchObject({ route: 'plugin.install' });
    expect(
      createAgentExtensionManagementHostRequest({
        route: 'plugin.remove',
        requestId: 'extensions-remove-1',
        identity,
        pluginId: 'computer-use',
      }),
    ).toMatchObject({
      route: 'plugin.remove',
      pluginId: 'computer-use',
    });
    expect(
      createAgentExtensionManagementHostRequest({
        route: 'skill.open',
        requestId: 'skill-open-1',
        identity,
        managementId: `skill:${'b'.repeat(64)}`,
      }),
    ).toMatchObject({ route: 'skill.open' });
    expect(
      createAgentExtensionManagementHostRequest({
        route: 'skill.reveal',
        requestId: 'skill-reveal-1',
        identity,
        managementId: `skill:${'b'.repeat(64)}`,
      }),
    ).toMatchObject({ route: 'skill.reveal' });
    expect(
      parseAgentExtensionManagementHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          projection: createProjection(),
        },
        request,
      ),
    ).toMatchObject({ projection: { identity } });
    expect(
      parseAgentExtensionManagementHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          projection: {
            ...createProjection(),
            extensions: [
              {
                ...createProjection().extensions[0],
                enabled: false,
                canEnable: true,
                canDisable: false,
                canRemove: false,
                agentStatus: 'disabled',
              },
            ],
          },
        },
        request,
      ),
    ).toMatchObject({
      projection: {
        extensions: [
          expect.objectContaining({
            enabled: false,
            agentStatus: 'disabled',
          }),
        ],
      },
    });
    expect(
      parseAgentExtensionManagementHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          projection: {
            ...createProjection(),
            extensions: [
              {
                ...createProjection().extensions[0],
                enabled: false,
                canEnable: true,
                canDisable: false,
                deliverySource: 'local',
                canRemove: true,
                agentStatus: 'disabled',
              },
            ],
          },
        },
        request,
      ),
    ).toMatchObject({
      projection: {
        extensions: [
          expect.objectContaining({
            deliverySource: 'local',
            canRemove: true,
          }),
        ],
      },
    });
    expect(
      parseAgentExtensionManagementHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          projection: {
            ...createProjection(),
            extensions: [
              {
                ...createProjection().extensions[0],
                enabled: false,
                canEnable: false,
                canDisable: false,
                deliverySource: 'local',
                canRemove: true,
                agentStatus: 'error',
                runtimeDiagnosticCode: 'state-invalid',
              },
            ],
          },
        },
        request,
      ),
    ).toMatchObject({
      projection: {
        extensions: [
          expect.objectContaining({
            agentStatus: 'error',
            canEnable: false,
            canRemove: true,
          }),
        ],
      },
    });
  });

  it('rejects stale owners, unknown fields and physical paths', () => {
    const request = createRequest();
    const result = {
      requestId: request.requestId,
      route: request.route,
      projection: createProjection(),
    };
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: { ...result.projection, identity: { ...identity, windowId: 'window-2' } },
        },
        request,
      ),
    ).toThrow('owner identity is stale');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        { ...result, projection: { ...result.projection, absolutePath: '/Users/private' } },
        request,
      ),
    ).toThrow('projection is invalid');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            extensions: [{ ...result.projection.extensions[0], command: ['install', '--force'] }],
          },
        },
        request,
      ),
    ).toThrow('extension item is invalid');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            extensions: [
              { ...result.projection.extensions[0], marketplace: 'foreign-marketplace' },
            ],
          },
        },
        request,
      ),
    ).toThrow('extension item is invalid');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            extensions: [
              {
                ...result.projection.extensions[0],
                localization: { zh_CN: { description: '无效语言标识' } },
              },
            ],
          },
        },
        request,
      ),
    ).toThrow('localization locale is invalid');
  });

  it('rejects inconsistent management capabilities and discovery diagnostics', () => {
    const request = createRequest();
    const result = {
      requestId: request.requestId,
      route: request.route,
      projection: createProjection(),
    };
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            skills: [{ ...result.projection.skills[0], canRemove: false }],
          },
        },
        request,
      ),
    ).toThrow('capabilities are inconsistent');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            extensionDiscovery: { diagnostics: [{ code: 'unknown', count: 1 }] },
          },
        },
        request,
      ),
    ).toThrow('diagnostic code is invalid');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            extensions: [{ ...result.projection.extensions[0], canUpdate: true }],
          },
        },
        request,
      ),
    ).toThrow('extension item is invalid');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            extensions: [
              {
                ...result.projection.extensions[0],
                enabled: false,
                canEnable: true,
                canDisable: false,
                canRemove: true,
              },
            ],
          },
        },
        request,
      ),
    ).toThrow('extension flags are inconsistent');
  });
});

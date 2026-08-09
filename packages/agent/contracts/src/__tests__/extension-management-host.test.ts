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
    operations: [
      {
        operationId: 'artifact-operation-1',
        pluginId: 'computer-use@openneko',
        kind: 'update',
        phase: 'downloading',
        status: 'active',
        transferredBytes: 1024,
        totalBytes: 2048,
        canCancel: true,
        diagnosticCode: '',
      },
    ],
    skills: [
      {
        id: 'personal:personal:story-planner',
        name: 'story-planner',
        description: 'Plan a story.',
        source: 'personal',
        sourceId: 'personal',
        managementId: `skill:${'b'.repeat(64)}`,
        canRemove: true,
      },
    ],
    skillDiscovery: {
      diagnostics: [{ code: 'invalid_metadata', source: 'personal', count: 1 }],
      duplicateCount: 0,
    },
    extensions: [
      {
        id: 'computer-use@openneko',
        name: 'computer-use',
        displayName: 'Computer Use',
        description: 'Control Mac apps.',
        version: '1.0.2',
        developer: 'OpenAI',
        marketplace: 'openneko',
        category: 'Productivity',
        installed: true,
        enabled: true,
        canInstall: false,
        canUpdate: false,
        canEnable: false,
        canDisable: true,
        canRemove: false,
        updatePackageRelease: '',
        artifactPlatform: 'darwin-arm64',
        downloadSizeBytes: 64_208_172,
        artifactStatus: 'installed',
        dependencyStatus: 'ready',
        enableGrantStatus: 'accepted',
        hostPermissionStatus: 'granted',
        qualificationStatus: 'qualified',
        declaredPermissions: ['accessibility', 'screen-recording'],
        acceptedPermissions: ['accessibility', 'screen-recording'],
        agentStatus: 'ready',
        runtimeDiagnosticCode: '',
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
        route: 'plugin.update',
        requestId: 'extensions-update-1',
        identity,
        pluginId: 'computer-use@openneko',
      }),
    ).toMatchObject({ route: 'plugin.update', pluginId: 'computer-use@openneko' });
    expect(
      createAgentExtensionManagementHostRequest({
        route: 'plugin.operation.cancel',
        requestId: 'extensions-cancel-1',
        identity,
        operationId: 'artifact-operation-1',
      }),
    ).toMatchObject({
      route: 'plugin.operation.cancel',
      operationId: 'artifact-operation-1',
    });
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
    ).toThrow('removal capability is inconsistent');
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
    ).toThrow('extension flags are inconsistent');
    expect(() =>
      parseAgentExtensionManagementHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            operations: [
              {
                ...result.projection.operations[0],
                status: 'completed',
                canCancel: false,
              },
            ],
          },
        },
        request,
      ),
    ).toThrow('artifact operation state is inconsistent');
  });
});

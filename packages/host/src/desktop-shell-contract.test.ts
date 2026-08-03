import { describe, expect, it } from 'vitest';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProfileRequest,
  createDesktopProjectOpenRequest,
  createDesktopProjectRemoveRecentRequest,
  createDesktopTabMutationRequest,
  DesktopShellContractError,
  parseDesktopShellProjection,
  parseDesktopShellProjectionEvent,
} from './desktop-shell-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';

describe('Desktop Shell contract', () => {
  it('creates fixed profile and revision-bound Tab requests', () => {
    expect(createDesktopProfileRequest('request-1', 'character')).toEqual({
      schemaVersion: 1,
      requestId: 'request-1',
      profile: 'character',
    });
    expect(createDesktopTabMutationRequest('request-2', 'tab-1', 'app-1:window-1:1', 4)).toEqual({
      schemaVersion: 1,
      requestId: 'request-2',
      expectedEndpointEpoch: 'app-1:window-1:1',
      tabId: 'tab-1',
      expectedWindowRevision: 4,
    });
    expect(
      createDesktopProjectOpenRequest('request-3', 'content:workspace-1', 'app-1:window-1:1', 5),
    ).toEqual({
      schemaVersion: 1,
      requestId: 'request-3',
      expectedEndpointEpoch: 'app-1:window-1:1',
      expectedWindowRevision: 5,
      projectId: 'content:workspace-1',
    });
    expect(
      createDesktopProjectRemoveRecentRequest(
        'request-4',
        'content:workspace-1',
        'app-1:window-1:1',
        5,
        3,
      ),
    ).toEqual({
      schemaVersion: 1,
      requestId: 'request-4',
      expectedEndpointEpoch: 'app-1:window-1:1',
      expectedWindowRevision: 5,
      expectedCatalogRevision: 3,
      projectId: 'content:workspace-1',
    });
    expect(
      createDesktopConversationDeleteRequest(
        'request-5',
        {
          projectId: 'content:workspace-1',
          workspaceId: 'workspace-1',
          conversationId: 'conversation-1',
        },
        'app-1:window-1:1',
        5,
        7,
      ),
    ).toEqual({
      schemaVersion: 1,
      requestId: 'request-5',
      expectedEndpointEpoch: 'app-1:window-1:1',
      expectedWindowRevision: 5,
      expectedAgentHomeRevision: 7,
      navigation: {
        projectId: 'content:workspace-1',
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
      },
    });
  });

  it('rejects an active Tab that is not in the Window projection', () => {
    expect(() =>
      parseDesktopShellProjection({
        ...validProjection(),
        window: {
          ...validProjection().window,
          activeTarget: { kind: 'project', tabId: 'missing-tab' },
        },
      }),
    ).toThrowError(DesktopShellContractError);
  });

  it('rejects absolute path leakage by projecting only known Project fields', () => {
    const projection = parseDesktopShellProjection({
      ...validProjection(),
      catalog: {
        revision: 1,
        projects: [
          {
            ...validProjection().catalog.projects[0],
            workspacePath: '/Users/private/workspace',
          },
        ],
      },
    });

    expect(projection.catalog.projects[0]).not.toHaveProperty('workspacePath');
    expect(JSON.stringify(projection)).not.toContain('/Users/private');
  });

  it('rejects projection events whose Window identity does not match', () => {
    expect(() =>
      parseDesktopShellProjectionEvent({
        schemaVersion: 1,
        applicationInstanceId: 'app-1',
        windowId: 'window-2',
        rendererEpoch: 1,
        sequence: 1,
        projection: validProjection(),
      }),
    ).toThrowError(DesktopShellContractError);
  });

  it('accepts ready domains only in their owning Phase 1 slices', () => {
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'agent',
            status: 'ready',
            ownerSlice: 'P1.3',
          },
        ],
      }).domains,
    ).toEqual([{ surface: 'agent', status: 'ready', ownerSlice: 'P1.3' }]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'media-library',
            status: 'ready',
            ownerSlice: 'P1.4',
          },
        ],
      }).domains,
    ).toEqual([{ surface: 'media-library', status: 'ready', ownerSlice: 'P1.4' }]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'canvas',
            status: 'ready',
            ownerSlice: 'P1.4',
          },
        ],
      }).domains,
    ).toEqual([{ surface: 'canvas', status: 'ready', ownerSlice: 'P1.4' }]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'cut',
            status: 'ready',
            ownerSlice: 'P1.5',
          },
          {
            surface: 'preview',
            status: 'ready',
            ownerSlice: 'P1.5',
          },
        ],
      }).domains,
    ).toEqual([
      { surface: 'cut', status: 'ready', ownerSlice: 'P1.5' },
      { surface: 'preview', status: 'ready', ownerSlice: 'P1.5' },
    ]);
  });
});

function validProjection() {
  return {
    schemaVersion: 1 as const,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
    catalog: {
      revision: 1,
      projects: [
        {
          projectId: 'content:workspace-1',
          workspaceId: 'workspace-1',
          profile: 'content' as const,
          displayName: 'Fixture',
          createdAt: '2026-07-27T00:00:00.000Z',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      ],
    },
    window: {
      windowId: 'window-1',
      revision: 1,
      activeTarget: { kind: 'project' as const, tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: 'content:workspace-1',
          viewId: 'view-1',
          viewEpoch: 1,
        },
      ],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
    },
    agentHome: {
      revision: 0,
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    domains: [
      {
        surface: 'agent' as const,
        status: 'unavailable' as const,
        ownerSlice: 'P1.3' as const,
        diagnosticCode: 'desktop-domain-surface-unavailable' as const,
      },
    ],
  };
}

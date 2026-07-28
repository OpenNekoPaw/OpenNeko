import { describe, expect, it } from 'vitest';
import {
  createDesktopProfileRequest,
  createDesktopTabMutationRequest,
  DesktopShellContractError,
  parseDesktopShellProjection,
  parseDesktopShellProjectionEvent,
} from './shell-contract';

describe('Desktop Shell contract', () => {
  it('creates fixed profile and revision-bound Tab requests', () => {
    expect(createDesktopProfileRequest('request-1', 'character')).toEqual({
      schemaVersion: 1,
      requestId: 'request-1',
      profile: 'character',
    });
    expect(
      createDesktopTabMutationRequest('request-2', 'tab-1', 'app-1:window-1:1', 4),
    ).toEqual({
      schemaVersion: 1,
      requestId: 'request-2',
      expectedEndpointEpoch: 'app-1:window-1:1',
      tabId: 'tab-1',
      expectedWindowRevision: 4,
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
    },
    attention: { needsInput: 0, needsReview: 0, running: 0 },
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

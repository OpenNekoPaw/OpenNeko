import { describe, expect, it } from 'vitest';
import {
  DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
  createDesktopWorkspaceGrantChooseRequest,
  parseDesktopWorkspaceGrantChooseResult,
} from './desktop-workspace-grant-contract';

describe('Desktop Workspace grant contract', () => {
  it('round-trips an opaque grant without exposing a host path', () => {
    const result = parseDesktopWorkspaceGrantChooseResult({
      schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
      requestId: 'request-1',
      status: 'authorized',
      grant: {
        schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
        workspaceGrantId: 'workspace-grant:1',
        windowId: 'window-1',
        label: 'demo',
      },
    });
    expect(result).toMatchObject({
      status: 'authorized',
      grant: { workspaceGrantId: 'workspace-grant:1', windowId: 'window-1', label: 'demo' },
    });
    expect(JSON.stringify(result)).not.toContain('/Users/fixture');
  });

  it('rejects raw paths, unknown fields and mismatched request identities', () => {
    expect(() =>
      parseDesktopWorkspaceGrantChooseResult(
        {
          schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
          requestId: 'request-1',
          status: 'authorized',
          grant: {
            schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
            workspaceGrantId: 'workspace-grant:1',
            windowId: 'window-1',
            label: 'demo',
            path: '/Users/fixture/demo',
          },
        },
        'request-1',
      ),
    ).toThrow(/unknown field 'path'/);
    expect(() =>
      parseDesktopWorkspaceGrantChooseResult(
        {
          schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
          requestId: 'request-other',
          status: 'cancelled',
        },
        'request-1',
      ),
    ).toThrow(/request identity does not match/);
    expect(() =>
      createDesktopWorkspaceGrantChooseRequest({
        requestId: 'request-1',
        expectedEndpointEpoch: 'epoch-1',
        windowId: '',
        expectedWindowRevision: 0,
      }),
    ).toThrow(/Window identity is required/);
  });
});

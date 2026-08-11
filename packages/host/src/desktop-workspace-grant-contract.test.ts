import { describe, expect, it } from 'vitest';
import {
  createDesktopContentProjectTargetRequest,
  createDesktopWorkspaceAuthoringLibraryTargetRequest,
  createDesktopWorkspaceDirectoryTargetRequest,
  createDesktopWorkspaceProjectTargetRequest,
  parseDesktopWorkspaceGrantTargetResult,
} from './desktop-workspace-grant-contract';

describe('Desktop Workspace grant contract', () => {
  it('round-trips an opaque grant without exposing a host path', () => {
    const result = parseDesktopWorkspaceGrantTargetResult({
      requestId: 'request-1',
      status: 'authorized',
      workspaceId: 'workspace-1',
      grant: {
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
      parseDesktopWorkspaceGrantTargetResult(
        {
          requestId: 'request-1',
          status: 'authorized',
          workspaceId: 'workspace-1',
          grant: {
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
      parseDesktopWorkspaceGrantTargetResult(
        {
          requestId: 'request-other',
          status: 'cancelled',
        },
        'request-1',
      ),
    ).toThrow(/request identity does not match/);
    expect(() =>
      createDesktopWorkspaceDirectoryTargetRequest({
        requestId: 'request-1',
        rendererSessionId: 'epoch-1',
        windowId: '',
      }),
    ).toThrow(/Window identity is required/);
    expect(
      createDesktopWorkspaceProjectTargetRequest({
        requestId: 'request-2',
        rendererSessionId: 'epoch-1',
        windowId: 'window-1',
        projectId: 'project-1',
      }),
    ).toMatchObject({ operation: 'select-project', projectId: 'project-1' });
  });

  it('keeps Content creation and configured authoring libraries as closed Host operations', () => {
    expect(
      createDesktopContentProjectTargetRequest({
        requestId: 'request-content',
        rendererSessionId: 'epoch-1',
        windowId: 'window-1',
      }),
    ).toMatchObject({ operation: 'create-content-project' });
    expect(
      createDesktopWorkspaceAuthoringLibraryTargetRequest({
        requestId: 'request-library',
        rendererSessionId: 'epoch-1',
        windowId: 'window-1',
        library: 'character',
      }),
    ).toMatchObject({ operation: 'select-authoring-library', library: 'character' });
    expect(
      parseDesktopWorkspaceGrantTargetResult({
        requestId: 'request-content',
        status: 'authorized-project',
        workspaceId: 'workspace-1',
        projectId: 'content:workspace-1',
        grant: {
          workspaceGrantId: 'grant-1',
          windowId: 'window-1',
          label: 'Novel',
        },
      }),
    ).toMatchObject({ status: 'authorized-project', projectId: 'content:workspace-1' });
  });
});

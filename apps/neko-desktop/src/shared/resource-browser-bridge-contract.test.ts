import { describe, expect, it } from 'vitest';
import { createResourceBrowserViewId } from '@neko-assets/domain/resource-browser/contract';
import { createDesktopResourceBrowserIdentity } from './resource-browser-bridge-contract';

describe('Desktop Resource Browser bridge contract', () => {
  it('derives the Resource Browser identity from the owning Project View', () => {
    expect(
      createDesktopResourceBrowserIdentity({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        projectViewId: 'project-view-1',
        projectViewEpoch: 4,
        endpointEpoch: 'endpoint-1',
      }),
    ).toEqual({
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: createResourceBrowserViewId('project-view-1'),
      viewEpoch: 4,
      endpointEpoch: 'endpoint-1',
    });
  });
});

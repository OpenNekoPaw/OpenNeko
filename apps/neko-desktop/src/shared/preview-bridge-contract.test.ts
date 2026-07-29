import { describe, expect, it } from 'vitest';
import {
  createDesktopPreviewBootstrapRequest,
  parseDesktopPreviewBootstrapRequest,
} from './preview-bridge-contract';

describe('Desktop Preview bridge contract', () => {
  it('carries the explicit View/session owner without a path or transport URL', () => {
    expect(
      createDesktopPreviewBootstrapRequest({
        requestId: 'request-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        viewId: 'preview-1',
        viewEpoch: 1,
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
      }),
    ).toEqual({
      schemaVersion: 1,
      requestId: 'request-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'preview-1',
      viewEpoch: 1,
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
    });
  });

  it('rejects raw paths and unknown versions', () => {
    expect(() =>
      parseDesktopPreviewBootstrapRequest({
        schemaVersion: 1,
        requestId: 'request-1',
        projectId: '/Users/private/project',
        workspaceId: 'workspace-1',
        viewId: 'preview-1',
        viewEpoch: 1,
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
      }),
    ).toThrow('Project identity is invalid');
    expect(() =>
      parseDesktopPreviewBootstrapRequest({
        schemaVersion: 2,
      }),
    ).toThrow('Unsupported Desktop Preview version');
  });
});

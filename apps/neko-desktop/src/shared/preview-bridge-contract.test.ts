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
        viewInstanceId: 'view-instance-1',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      }),
    ).toEqual({
      requestId: 'request-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      viewId: 'preview-1',
      viewInstanceId: 'view-instance-1',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    });
  });

  it('rejects raw paths and unknown fields', () => {
    expect(() =>
      parseDesktopPreviewBootstrapRequest({
        requestId: 'request-1',
        projectId: '/Users/private/project',
        workspaceId: 'workspace-1',
        viewId: 'preview-1',
        viewInstanceId: 'view-instance-1',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      }),
    ).toThrow('Project identity is invalid');
    expect(() =>
      parseDesktopPreviewBootstrapRequest({
        requestId: 'request-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        viewId: 'preview-1',
        viewInstanceId: 'view-instance-1',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
        removedTechnicalField: true,
      }),
    ).toThrow('unsupported fields');
  });
});

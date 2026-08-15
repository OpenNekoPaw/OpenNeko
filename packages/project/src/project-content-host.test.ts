import { describe, expect, it } from 'vitest';
import {
  createProjectContentHostRequest,
  parseProjectAuthoringHostRequest,
  parseProjectContentHostResult,
} from './contracts/project-authoring-host';

const binding = {
  workspaceId: 'workspace-1',
  workspaceGrantId: 'grant-1',
  projectId: 'project-1',
};

describe('Project Content Host contract', () => {
  it('round-trips the exact binding and closed read-only projection', () => {
    const request = createProjectContentHostRequest({
      requestId: 'request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      binding,
    });
    expect(parseProjectAuthoringHostRequest(request)).toEqual({
      ...request,
      operation: 'content-get',
    });
    expect(
      parseProjectContentHostResult(
        {
          requestId: 'request-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          projection: {
            projectId: 'project-1',
            characters: [],
            worlds: [],
            elements: [],
            candidates: [],
            diagnostics: [],
          },
        },
        'request-1',
      ),
    ).toMatchObject({ projectId: 'project-1' });
  });

  it('rejects mutation payloads and cross-Project projections', () => {
    const request = createProjectContentHostRequest({
      requestId: 'request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      binding,
    });
    expect(() => parseProjectAuthoringHostRequest({ ...request, mutation: 'confirm' })).toThrow(
      /unknown or missing fields/u,
    );
    expect(() =>
      parseProjectContentHostResult(
        {
          requestId: 'request-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          projection: {
            projectId: 'project-other',
            characters: [],
            worlds: [],
            elements: [],
            candidates: [],
            diagnostics: [],
          },
        },
        'request-1',
      ),
    ).toThrow(/another Project/u);
  });
});

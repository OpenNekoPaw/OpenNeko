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

  it('validates Entity and candidate catalog metadata at the Host boundary', () => {
    const result = {
      requestId: 'request-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      projection: {
        projectId: 'project-1',
        characters: [],
        worlds: [],
        elements: [
          {
            owner: 'project-entity',
            entityId: 'entity-market',
            entityKind: 'location',
            label: 'Rain Market',
            updatedAt: '2026-08-23T00:00:00.000Z',
            availability: 'available',
          },
        ],
        candidates: [
          {
            owner: 'entity-candidate',
            candidateId: 'candidate-dockmaster',
            entityKind: 'character',
            label: 'Dockmaster',
            freshness: 'fresh',
            confidence: 0.82,
            evidenceCount: 2,
            updatedAt: '2026-08-22T12:00:00.000Z',
          },
        ],
        diagnostics: [],
      },
    };

    expect(parseProjectContentHostResult(result, 'request-1').projection).toMatchObject({
      elements: [expect.objectContaining({ updatedAt: '2026-08-23T00:00:00.000Z' })],
      candidates: [expect.objectContaining({ confidence: 0.82, evidenceCount: 2 })],
    });
    expect(() =>
      parseProjectContentHostResult(
        {
          ...result,
          projection: {
            ...result.projection,
            candidates: [{ ...result.projection.candidates[0], confidence: 1.2 }],
          },
        },
        'request-1',
      ),
    ).toThrow(/confidence/u);
  });
});

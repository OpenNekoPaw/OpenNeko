import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  createProjectLocalAuthoringHostRequest,
  parseProjectLocalAuthoringHostRequest,
  parseProjectLocalAuthoringHostResult,
} from './contracts/project-local-authoring-host';

describe('Project local authoring Host contract', () => {
  it('round-trips exact Project and Character target identities', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
    };
    const request = createProjectLocalAuthoringHostRequest({
      requestId: 'request-1',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      binding,
      create: {
        kind: 'character-project',
        characterProjectId: 'character-1',
        displayName: 'Aster',
        draft: {
          summary: '',
          backgroundStory: createEmptyCharacterBackgroundStory(),
          originSetting: createEmptyCharacterOriginSetting(),
          canon: [],
          knowledgeBoundary: [],
          behaviorPolicy: [],
          expressionPolicy: [],
          representationRefs: [],
        },
        entity: { kind: 'create', entityId: 'entity-aster', name: 'Aster' },
        sources: {
          evidence: [
            {
              kind: 'content',
              evidenceId: 'evidence-story',
              sourceWorkspaceId: 'workspace-1',
              sourceWorkspaceGrantId: 'grant-1',
              locator: { kind: 'workspace-file', path: 'story.md' },
              observedAt: '2026-08-12T00:00:00.000Z',
            },
          ],
          assetRepresentations: [
            {
              assetId: 'asset:portrait-main',
              resource: {
                kind: 'package-resource',
                packageId: 'asset:portrait-main',
                revision: 'publication:one',
                resourcePath: 'portrait/main.png',
              },
              representationId: 'portrait-main',
              representationKind: 'portrait',
            },
          ],
        },
      },
    });
    expect(request).toMatchObject({
      operation: 'create-local-target',
      ...binding,
      input: {
        entity: { kind: 'create', entityId: 'entity-aster', name: 'Aster' },
        sources: {
          evidence: [{ evidenceId: 'evidence-story' }],
          assetRepresentations: [{ representationId: 'portrait-main' }],
        },
      },
    });
    expect(() =>
      parseProjectLocalAuthoringHostRequest({
        ...request,
        input: {
          ...request.input,
          seed: { evidence: [], representationRefs: [] },
        },
      }),
    ).toThrow(/unknown or missing fields/u);
    expect(
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-1',
          ...binding,
          status: 'created',
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        },
        'request-1',
        binding,
        { kind: 'character-project', characterProjectId: 'character-1' },
      ),
    ).toMatchObject({
      status: 'created',
      target: { kind: 'character-project', characterProjectId: 'character-1' },
    });
  });

  it('rejects cross-Project responses and unknown creation fields', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
    };
    expect(() =>
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-1',
          ...binding,
          projectId: 'project-other',
          status: 'created',
          target: { kind: 'world-project', worldProjectId: 'world-1' },
        },
        'request-1',
        binding,
        { kind: 'world-project', worldProjectId: 'world-1' },
      ),
    ).toThrow(/projectId mismatch/u);
    expect(() =>
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-redirected',
          ...binding,
          status: 'created',
          target: { kind: 'character-project', characterProjectId: 'character-other' },
        },
        'request-redirected',
        binding,
        { kind: 'character-project', characterProjectId: 'character-expected' },
      ),
    ).toThrow(/target identity mismatch/u);
  });

  it('rejects obsolete retry operations and incomplete outcomes', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
    };
    expect(() =>
      parseProjectLocalAuthoringHostRequest({
        requestId: 'request-retry',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        operation: 'retry-local-character',
        binding,
        input: {},
      }),
    ).toThrow(/unknown or missing fields|Unknown Project local authoring operation/u);
    expect(() =>
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-incomplete',
          ...binding,
          status: 'incomplete',
          target: { kind: 'character-project', characterProjectId: 'character-1' },
          receipt: {},
        },
        'request-incomplete',
        binding,
        { kind: 'character-project', characterProjectId: 'character-1' },
      ),
    ).toThrow(/unknown or missing fields/u);
  });
});

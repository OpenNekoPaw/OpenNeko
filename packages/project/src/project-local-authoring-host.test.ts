import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  createProjectLocalAuthoringHostRequest,
  createProjectLocalAuthoringRetryHostRequest,
  parseProjectLocalAuthoringHostRequest,
  parseProjectLocalAuthoringHostResult,
} from './contracts/project-local-authoring-host';

describe('Project local authoring Host contract', () => {
  it('round-trips exact Project and Character target identities', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      contentProjectId: 'project-1',
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

  it('round-trips a canonical partial receipt and exact retry request', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      contentProjectId: 'project-1',
    };
    const receipt = partialReceipt(binding);
    expect(
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-incomplete',
          ...binding,
          status: 'incomplete',
          target: receipt.target,
          receipt,
        },
        'request-incomplete',
        binding,
        receipt.target,
      ),
    ).toEqual({
      requestId: 'request-incomplete',
      ...binding,
      status: 'incomplete',
      target: receipt.target,
      receipt,
    });
    expect(
      createProjectLocalAuthoringRetryHostRequest({
        requestId: 'request-retry',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        receipt,
        entity: { kind: 'create', entityId: 'entity-1', name: 'Aster' },
      }),
    ).toMatchObject({
      operation: 'retry-local-character',
      ...binding,
      input: { receipt, entity: { entityId: 'entity-1' } },
    });
  });

  it('rejects cross-Project responses and unknown creation fields', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      contentProjectId: 'project-1',
    };
    expect(() =>
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-1',
          ...binding,
          contentProjectId: 'project-other',
          status: 'created',
          target: { kind: 'world-project', worldProjectId: 'world-1' },
        },
        'request-1',
        binding,
        { kind: 'world-project', worldProjectId: 'world-1' },
      ),
    ).toThrow(/contentProjectId mismatch/u);
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

  it('rejects non-prefix receipts and cross-authority retries', () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      contentProjectId: 'project-1',
    };
    expect(() =>
      createProjectLocalAuthoringRetryHostRequest({
        requestId: 'request-invalid-prefix',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        receipt: {
          ...partialReceipt(binding),
          completedSteps: ['character-project', 'project-entity'],
        },
        entity: { kind: 'existing', entityId: 'entity-1' },
      }),
    ).toThrow(/canonical partial step prefix/u);
    expect(() =>
      createProjectLocalAuthoringRetryHostRequest({
        requestId: 'request-cross-authority',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        receipt: {
          ...partialReceipt(binding),
          authority: { workspaceId: 'workspace-other', contentProjectId: 'project-other' },
        },
        entity: { kind: 'existing', entityId: 'entity-1' },
      }),
    ).toThrow(/authority mismatch/u);
  });
});

function partialReceipt(binding: {
  readonly workspaceId: string;
  readonly contentProjectId: string;
}) {
  return {
    authority: {
      workspaceId: binding.workspaceId,
      contentProjectId: binding.contentProjectId,
    },
    target: { kind: 'character-project' as const, characterProjectId: 'character-1' },
    entityId: 'entity-1',
    completedSteps: ['character-project'] as const,
    nextStep: 'project-entity' as const,
  };
}

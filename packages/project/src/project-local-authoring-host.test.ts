import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  createProjectLocalAuthoringHostRequest,
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
      },
    });
    expect(request).toMatchObject({ operation: 'create-local-target', ...binding });
    expect(
      parseProjectLocalAuthoringHostResult(
        {
          requestId: 'request-1',
          ...binding,
          target: { kind: 'character-project', characterProjectId: 'character-1' },
        },
        'request-1',
        binding,
      ),
    ).toMatchObject({ target: { kind: 'character-project', characterProjectId: 'character-1' } });
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
          target: { kind: 'world-project', worldProjectId: 'world-1' },
        },
        'request-1',
        binding,
      ),
    ).toThrow(/contentProjectId mismatch/u);
  });
});

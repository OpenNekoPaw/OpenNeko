import { describe, expect, it } from 'vitest';
import {
  createProjectCreativeWorkspaceHostRequest,
  createProjectCreativeWorkspaceMutationHostRequest,
  parseProjectAuthoringHostRequest,
  parseProjectCreativeWorkspaceHostResult,
} from './contracts/project-authoring-host';

const binding = {
  workspaceId: 'workspace-1',
  workspaceGrantId: 'grant-1',
  projectId: 'project-1',
};

describe('Project Creative Workspace Host contract', () => {
  it('round-trips exact Workspace and Project identity for mixed-domain reads', () => {
    expect(
      createProjectCreativeWorkspaceHostRequest({
        requestId: 'request-workspace',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
      }),
    ).toEqual({
      requestId: 'request-workspace',
      rendererSessionId: 'renderer-1',
      windowId: 'window-1',
      operation: 'creative-workspace-get',
      ...binding,
    });
    expect(
      createProjectCreativeWorkspaceMutationHostRequest({
        requestId: 'request-mutation',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        binding,
        mutation: {
          kind: 'remove',
          reference: {
            kind: 'world-version',
            globalWorldId: 'global-world-1',
            worldVersionId: 'world-version-1',
          },
        },
      }),
    ).toMatchObject({ operation: 'creative-workspace-reference-mutate', ...binding });

    expect(
      parseProjectCreativeWorkspaceHostResult(
        {
          requestId: 'request-workspace',
          ...binding,
          projection: { composition: emptyComposition(binding.projectId) },
        },
        'request-workspace',
        binding,
      ),
    ).toMatchObject({ requestId: 'request-workspace', ...binding });
  });

  it('rejects obsolete publication preview operations and redirected results', () => {
    expect(() =>
      parseProjectAuthoringHostRequest({
        requestId: 'request-publication',
        rendererSessionId: 'renderer-1',
        windowId: 'window-1',
        operation: 'publication-preview',
        ...binding,
        outputs: [],
      }),
    ).toThrow('Unknown Project authoring operation');
    expect(() =>
      parseProjectCreativeWorkspaceHostResult(
        {
          requestId: 'request-cross-project',
          ...binding,
          projectId: 'project-other',
          projection: { composition: emptyComposition('project-other') },
        },
        'request-cross-project',
        binding,
      ),
    ).toThrow(/projectId mismatch/u);
  });
});

function emptyComposition(projectId: string) {
  return {
    projectId,
    content: [],
    characters: [],
    worlds: [],
    globalCharacters: [],
    globalWorlds: [],
    availableGlobalCharacters: [],
    availableGlobalWorlds: [],
    diagnostics: [],
  };
}

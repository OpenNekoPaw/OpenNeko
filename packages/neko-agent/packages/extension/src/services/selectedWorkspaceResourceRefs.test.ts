import { describe, expect, it } from 'vitest';
import { createSelectedWorkspaceResourceRefs } from './selectedWorkspaceResourceRefs';

describe('createSelectedWorkspaceResourceRefs', () => {
  it('creates stable workspace refs and ignores non-workspace content', () => {
    const refs = createSelectedWorkspaceResourceRefs('/workspace/project', [
      {
        id: 'script:1',
        contentLocator: { kind: 'workspace-file', path: 'scripts/story.md' },
        label: 'story.md',
        mediaType: 'text',
      },
      {
        id: 'outside:1',
        contentLocator: {
          kind: 'package-resource',
          packageId: 'private',
          revision: '1',
          resourcePath: 'private.md',
        },
        label: 'private.md',
      },
    ]);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      id: 'selected-reference:script:1',
      resourceRef: {
        scope: 'project',
        provider: 'workspace',
        kind: 'document',
        source: { kind: 'file', projectRelativePath: 'scripts/story.md' },
        locator: { kind: 'file', path: 'scripts/story.md' },
      },
    });
    expect(JSON.stringify(refs)).not.toContain('/workspace/project');
  });
});

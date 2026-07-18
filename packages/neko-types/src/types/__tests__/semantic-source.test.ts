import { describe, expect, it } from 'vitest';
import {
  isAutomaticEntityCandidateProjectionMetadata,
  isSemanticSourceDescriptor,
  isSemanticSourceScope,
} from '../semantic-source';

describe('semantic source contracts', () => {
  it('accepts portable registered scopes and source descriptors', () => {
    expect(
      isSemanticSourceScope({
        workspaceId: 'workspace-1',
        rootId: 'workspace',
        rootKind: 'workspace',
        portableRoot: '${WORKSPACE}',
        analysisMode: 'link-existing',
        priority: 0,
      }),
    ).toBe(true);
    expect(
      isSemanticSourceDescriptor({
        sourceId: 'workspace:docs/story.md',
        workspaceId: 'workspace-1',
        rootId: 'workspace',
        rootKind: 'workspace',
        relativePath: 'docs/story.md',
        portablePath: '${WORKSPACE}/docs/story.md',
        format: 'markdown',
        analysisMode: 'link-existing',
        fingerprint: 'sha256:source-v1',
        sizeBytes: 120,
        modifiedAtMs: 10,
      }),
    ).toBe(true);
  });

  it('rejects active-path identity and malformed candidate projection metadata', () => {
    expect(
      isSemanticSourceScope({
        workspaceId: '',
        rootId: 'active-workspace',
        rootKind: 'workspace',
        portableRoot: '/tmp/workspace',
        analysisMode: 'link-existing',
        priority: -1,
      }),
    ).toBe(false);
    expect(
      isAutomaticEntityCandidateProjectionMetadata({
        projectionKind: 'automatic-entity-candidate',
        normalizedName: 'rin',
        reviewStatus: 'confirmed',
        sourceOccurrenceCount: 1,
        explicitStructuralMentionCount: 1,
        mentionIds: ['mention-1'],
        entityRevision: 'entities-v1',
      }),
    ).toBe(false);
  });
});

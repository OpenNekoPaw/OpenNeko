import { describe, expect, it } from 'vitest';
import { projectCompositionResourceUsageProjections } from './application/project-resource-usage-projection';

describe('Project composition resource usage projection', () => {
  it('projects exact Entity, CharacterProject and CharacterVersion usage without payload copies', () => {
    const projections = projectCompositionResourceUsageProjections({
      composition: {
        contentProjectId: 'project-neko',
        localTargets: [
          { kind: 'character-project', characterProjectId: 'character-rin' },
          { kind: 'world-project', worldProjectId: 'world-future' },
        ],
        dependencies: [
          { kind: 'character-version', characterVersionId: 'rin-published' },
          { kind: 'world-experience-version', worldExperienceVersionId: 'world-release' },
        ],
        entityCharacterAssociations: [
          { entityId: 'entity-rin', characterProjectId: 'character-rin' },
        ],
      },
      sourceFingerprint: 'sha256:project-composition',
      updatedAt: '2026-08-13T08:00:00.000Z',
      availability: (target) =>
        target.ownerId === 'character-version' ? 'needs-attention' : 'available',
    });

    expect(projections).toEqual([
      expect.objectContaining({
        target: { ownerId: 'character-project', resourceId: 'character-rin' },
        usageCount: 2,
        dependencies: [{ targetOwnerId: 'project-entity', count: 1 }],
        availability: 'available',
      }),
      expect.objectContaining({
        target: { ownerId: 'character-version', resourceId: 'rin-published' },
        usageCount: 1,
        availability: 'needs-attention',
      }),
      expect.objectContaining({
        target: { ownerId: 'project-entity', resourceId: 'entity-rin' },
        usageCount: 1,
        dependencies: [{ targetOwnerId: 'character-project', count: 1 }],
      }),
    ]);
    expect(JSON.stringify(projections)).not.toContain('world-future');
    expect(JSON.stringify(projections)).not.toContain('world-release');
    expect(JSON.stringify(projections)).not.toContain('canonicalName');
  });
});

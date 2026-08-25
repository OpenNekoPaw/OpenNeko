import { describe, expect, it } from 'vitest';
import { PROJECT_REFERENCE_OWNER_KINDS, projectDependencySnapshot } from '../contracts';
import { ProjectCharacterVersionReferenceReader } from './project-character-version-reference-reader';

describe('Project CharacterVersion reference reader', () => {
  it('preserves each exact Project owner occurrence', async () => {
    const reader = new ProjectCharacterVersionReferenceReader({
      readDependencySnapshots: async () => [
        projectDependencySnapshot({
          projectId: 'project-a',
          owners: [
            {
              ownerKind: 'canvas',
              ownerId: 'board-a',
              sourceFingerprint: 'sha256:board-a',
              references: [{ kind: 'character-version', characterVersionId: 'version-a' }],
            },
            {
              ownerKind: 'cut',
              ownerId: 'cut-a',
              sourceFingerprint: 'sha256:cut-a',
              references: [{ kind: 'character-version', characterVersionId: 'version-a' }],
            },
          ],
          coverage: {
            expectedOwnerKinds: PROJECT_REFERENCE_OWNER_KINDS,
            coveredOwnerKinds: PROJECT_REFERENCE_OWNER_KINDS,
          },
        }),
      ],
    });
    await expect(reader.readReferences(['version-a'])).resolves.toEqual([
      {
        ownerKind: 'project',
        referenceKind: 'project-dependency',
        referenceId: 'project-a:canvas:board-a',
        characterVersionId: 'version-a',
      },
      {
        ownerKind: 'project',
        referenceKind: 'project-dependency',
        referenceId: 'project-a:cut:cut-a',
        characterVersionId: 'version-a',
      },
    ]);
  });

  it('fails closed when any Project dependency projection is incomplete', async () => {
    const reader = new ProjectCharacterVersionReferenceReader({
      readDependencySnapshots: async () => [
        projectDependencySnapshot({
          projectId: 'project-a',
          owners: [],
          coverage: {
            expectedOwnerKinds: PROJECT_REFERENCE_OWNER_KINDS,
            coveredOwnerKinds: ['character', 'world'],
          },
        }),
      ],
    });
    await expect(reader.readReferences(['version-a'])).rejects.toThrow(
      'Project dependency reference inventory is incomplete',
    );
  });
});

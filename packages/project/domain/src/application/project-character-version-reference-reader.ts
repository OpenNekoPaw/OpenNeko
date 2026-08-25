import type { CharacterVersionReferenceReader } from '@neko/chara-domain/application';
import type { CharacterVersionReference } from '@neko/chara-domain/contracts';
import type { ProjectDependencySnapshot } from '../contracts/project-dependency';

export interface ProjectDependencyCatalogReaderPort {
  readDependencySnapshots(signal?: AbortSignal): Promise<readonly ProjectDependencySnapshot[]>;
}

export class ProjectCharacterVersionReferenceReader implements CharacterVersionReferenceReader {
  readonly ownerKind = 'project' as const;

  constructor(private readonly catalog: ProjectDependencyCatalogReaderPort) {}

  async readReferences(
    characterVersionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly CharacterVersionReference[]> {
    const exactCharacterVersionIds = new Set(
      characterVersionIds.map((characterVersionId) =>
        requireIdentity(characterVersionId, 'CharacterVersion'),
      ),
    );
    const snapshots = await this.catalog.readDependencySnapshots(signal);
    signal?.throwIfAborted();
    const incomplete = snapshots.filter(
      (snapshot) => snapshot.coverage === 'incomplete' || snapshot.diagnostics.length > 0,
    );
    if (incomplete.length > 0) {
      throw new Error(
        `Project dependency reference inventory is incomplete for ${incomplete
          .map((snapshot) => `'${snapshot.projectId}'`)
          .join(', ')}.`,
      );
    }
    const projectIds = snapshots.map((snapshot) => snapshot.projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      throw new Error(
        'Project dependency reference inventory contains duplicate Project identity.',
      );
    }
    return snapshots.flatMap((snapshot) =>
      snapshot.dependencies.flatMap((item) => {
        const dependency = item.dependency;
        if (
          dependency.kind !== 'character-version' ||
          !exactCharacterVersionIds.has(dependency.characterVersionId)
        ) {
          return [];
        }
        return item.occurrences.map((occurrence) => ({
          ownerKind: 'project' as const,
          referenceKind: 'project-dependency' as const,
          referenceId: `${snapshot.projectId}:${occurrence.ownerKind}:${occurrence.ownerId}`,
          characterVersionId: dependency.characterVersionId,
        }));
      }),
    );
  }
}

function requireIdentity(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} identity must be non-empty.`);
  return value;
}

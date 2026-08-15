import {
  characterVersionReferenceKey,
  parseCharacterVersionLineage,
  parseCharacterVersionReferenceInventory,
  type CharacterProject,
  type CharacterVersion,
  type CharacterVersionReference,
  type CharacterVersionReferenceInventory,
} from '@neko/chara/contracts';
import type { CharacterAuthoringRepository } from './character-authoring-service';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';
import type { CharacterVersionReferenceInventoryService } from './character-version-reference-service';

export interface CharacterVersionDeletionRepository extends Pick<
  CharacterAuthoringRepository,
  'readProject' | 'readPublication'
> {
  deletePublication(
    characterProjectId: string,
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface DeleteCharacterVersionInput {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
}

export interface CharacterVersionDeletionResult {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly removedOwnedLineageRelation: boolean;
  readonly referenceInventory: CharacterVersionReferenceInventory;
}

export type CharacterVersionDeletionDiagnosticCode =
  | 'character-version-deletion-project-unavailable'
  | 'character-version-deletion-version-unavailable'
  | 'character-version-deletion-owner-mismatch'
  | 'character-version-deletion-lineage-owner-mismatch';

export class CharacterVersionDeletionError extends Error {
  constructor(
    readonly code: CharacterVersionDeletionDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterVersionDeletionError';
  }
}

export class CharacterVersionDeletionBlockedError extends Error {
  readonly code = 'character-version-deletion-blocked';

  constructor(
    readonly reason: 'referenced' | 'reference-inventory-incomplete',
    readonly referenceInventory: CharacterVersionReferenceInventory,
  ) {
    super(
      reason === 'referenced'
        ? `CharacterVersion '${referenceInventory.characterVersionId}' is referenced and cannot be deleted.`
        : `CharacterVersion '${referenceInventory.characterVersionId}' reference inventory is incomplete and deletion is blocked.`,
    );
    this.name = 'CharacterVersionDeletionBlockedError';
  }
}

export class CharacterVersionDeletionService {
  constructor(
    private readonly ports: {
      readonly repository: CharacterVersionDeletionRepository;
      readonly lineage: CharacterVersionLineageRepository;
      readonly references: CharacterVersionReferenceInventoryService;
    },
  ) {}

  async deleteVersion(
    input: DeleteCharacterVersionInput,
    signal?: AbortSignal,
  ): Promise<CharacterVersionDeletionResult> {
    const characterProjectId = requireIdentity(input.characterProjectId, 'CharacterProject');
    const characterVersionId = requireIdentity(input.characterVersionId, 'CharacterVersion');
    signal?.throwIfAborted();
    const [project, version, inventory] = await Promise.all([
      this.ports.repository.readProject(characterProjectId, signal),
      this.ports.repository.readPublication(characterVersionId, signal),
      this.ports.references.readInventory(characterVersionId, signal),
    ]);
    requireProject(project, characterProjectId);
    requireVersion(version, characterProjectId, characterVersionId);
    const lineage = await this.ports.lineage.readLineage(characterProjectId, signal);
    signal?.throwIfAborted();
    if (lineage !== undefined && lineage.characterProjectId !== characterProjectId) {
      throw new CharacterVersionDeletionError(
        'character-version-deletion-lineage-owner-mismatch',
        `CharacterVersion lineage '${lineage.characterProjectId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
      );
    }
    const currentReferences = structuralReferences(
      project,
      lineage?.relations ?? [],
      characterVersionId,
    );
    const exactInventory = appendReferences(inventory, currentReferences);
    if (exactInventory.coverage === 'incomplete') {
      throw new CharacterVersionDeletionBlockedError(
        'reference-inventory-incomplete',
        exactInventory,
      );
    }
    if (exactInventory.references.length > 0) {
      throw new CharacterVersionDeletionBlockedError('referenced', exactInventory);
    }

    const remainingRelations = (lineage?.relations ?? []).filter(
      (relation) => relation.characterVersionId !== characterVersionId,
    );
    const removedOwnedLineageRelation =
      remainingRelations.length !== (lineage?.relations.length ?? 0);
    if (lineage !== undefined && removedOwnedLineageRelation) {
      await this.ports.lineage.saveLineage(
        parseCharacterVersionLineage({ characterProjectId, relations: remainingRelations }),
        signal,
      );
    }
    await this.ports.repository.deletePublication(characterProjectId, characterVersionId, signal);
    return {
      characterProjectId,
      characterVersionId,
      removedOwnedLineageRelation,
      referenceInventory: exactInventory,
    };
  }
}

function structuralReferences(
  project: CharacterProject,
  relations: readonly {
    readonly characterVersionId: string;
    readonly parentCharacterVersionIds: readonly string[];
  }[],
  characterVersionId: string,
): readonly CharacterVersionReference[] {
  const references: CharacterVersionReference[] = [];
  if (project.draftBasisCharacterVersionId === characterVersionId) {
    references.push({
      ownerKind: 'chara',
      referenceKind: 'working-draft-basis',
      referenceId: project.characterProjectId,
      characterVersionId,
    });
  }
  for (const relation of relations) {
    if (relation.parentCharacterVersionIds.includes(characterVersionId)) {
      references.push({
        ownerKind: 'chara',
        referenceKind: 'lineage-child',
        referenceId: relation.characterVersionId,
        characterVersionId,
      });
    }
  }
  return references;
}

function appendReferences(
  inventory: CharacterVersionReferenceInventory,
  references: readonly CharacterVersionReference[],
): CharacterVersionReferenceInventory {
  const byKey = new Map(
    inventory.references.map((reference) => [characterVersionReferenceKey(reference), reference]),
  );
  for (const reference of references) byKey.set(characterVersionReferenceKey(reference), reference);
  return parseCharacterVersionReferenceInventory({
    ...inventory,
    references: [...byKey.values()],
  });
}

function requireProject(
  project: CharacterProject | undefined,
  characterProjectId: string,
): asserts project is CharacterProject {
  if (project === undefined) {
    throw new CharacterVersionDeletionError(
      'character-version-deletion-project-unavailable',
      `CharacterProject '${characterProjectId}' is unavailable.`,
    );
  }
}

function requireVersion(
  version: CharacterVersion | undefined,
  characterProjectId: string,
  characterVersionId: string,
): asserts version is CharacterVersion {
  if (version === undefined) {
    throw new CharacterVersionDeletionError(
      'character-version-deletion-version-unavailable',
      `CharacterVersion '${characterVersionId}' is unavailable.`,
    );
  }
  if (version.characterProjectId !== characterProjectId) {
    throw new CharacterVersionDeletionError(
      'character-version-deletion-owner-mismatch',
      `CharacterVersion '${characterVersionId}' does not belong to exact CharacterProject '${characterProjectId}'.`,
    );
  }
}

function requireIdentity(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} identity must be non-empty.`);
  return value;
}

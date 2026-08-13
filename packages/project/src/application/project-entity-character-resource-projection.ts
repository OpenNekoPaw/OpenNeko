import type {
  CharacterAuthoringCatalog,
  CharacterDurableRecordDiagnostic,
} from '@neko/chara/application';
import type { ProjectEntityCharacterAssociationFact } from '../contracts/project-entity-character-association';
import type { ProjectEntityCharacterResourceProjection } from '../contracts/project-entity-character-resource-projection';
import { projectEntityCharacterHandoffs } from './project-entity-character-handoff';

export function projectEntityCharacterResourceProjections(input: {
  readonly projectId: string;
  readonly associations: readonly ProjectEntityCharacterAssociationFact[];
  readonly characters: CharacterAuthoringCatalog;
}): readonly ProjectEntityCharacterResourceProjection[] {
  requireMatchingCatalogScope(input.projectId, input.characters);
  return input.associations.map((association) => {
    if (association.projectId !== input.projectId) {
      throw new Error('Project Entity Character association belongs to another Content Project.');
    }
    const project = input.characters.projects.find(
      (candidate) => candidate.characterProjectId === association.characterProjectId,
    );
    const diagnostic = findCharacterProjectDiagnostic(
      input.characters.diagnostics,
      association.characterProjectId,
    );
    if (!project || diagnostic) {
      return {
        entityId: association.entityId,
        characterProjectId: association.characterProjectId,
        placement: 'project-local',
        availability: 'needs-attention',
        handoffs: [],
        publishedVersionCount: 0,
        interactionStatus: 'unavailable',
        diagnostic:
          diagnostic?.message ??
          `Associated CharacterProject '${association.characterProjectId}' is unavailable.`,
      };
    }
    const publishedVersionCount = input.characters.versions.filter(
      (publication) => publication.characterProjectId === association.characterProjectId,
    ).length;
    return {
      entityId: association.entityId,
      characterProjectId: association.characterProjectId,
      displayName: project.displayName,
      placement: 'project-local',
      availability: 'available',
      handoffs: projectEntityCharacterHandoffs({
        projectId: input.projectId,
        associations: input.associations,
        entityId: association.entityId,
      }),
      publishedVersionCount,
      interactionStatus: publishedVersionCount > 0 ? 'select-version' : 'unavailable',
    };
  });
}

function requireMatchingCatalogScope(
  projectId: string,
  characters: CharacterAuthoringCatalog,
): void {
  if (
    characters.scope.kind !== 'content-project' ||
    characters.scope.contentProjectId !== projectId
  ) {
    throw new Error(`Character catalog does not belong to Content Project '${projectId}'.`);
  }
}

function findCharacterProjectDiagnostic(
  diagnostics: readonly CharacterDurableRecordDiagnostic[],
  characterProjectId: string,
): CharacterDurableRecordDiagnostic | undefined {
  return diagnostics.find(
    (diagnostic) =>
      diagnostic.recordKind === 'character-project' && diagnostic.recordId === characterProjectId,
  );
}

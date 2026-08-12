import type {
  CharacterAuthoringCatalog,
  CharacterDurableRecordDiagnostic,
} from '@neko/chara/application';
import {
  parseContentProjectComposition,
  type ContentProjectComposition,
} from '../contracts/project-composition';
import type { ProjectEntityCharacterResourceProjection } from '../contracts/project-entity-character-resource-projection';
import { projectEntityCharacterHandoffs } from './project-entity-character-handoff';

export function projectEntityCharacterResourceProjections(input: {
  readonly composition: ContentProjectComposition;
  readonly characters: CharacterAuthoringCatalog;
}): readonly ProjectEntityCharacterResourceProjection[] {
  const composition = parseContentProjectComposition(input.composition);
  requireMatchingCatalogScope(composition, input.characters);
  return composition.entityCharacterAssociations.map((association) => {
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
        composition,
        entityId: association.entityId,
      }),
      publishedVersionCount,
      interactionStatus: publishedVersionCount > 0 ? 'select-version' : 'unavailable',
    };
  });
}

function requireMatchingCatalogScope(
  composition: ContentProjectComposition,
  characters: CharacterAuthoringCatalog,
): void {
  if (
    characters.scope.kind !== 'content-project' ||
    characters.scope.contentProjectId !== composition.contentProjectId
  ) {
    throw new Error(
      `Character catalog does not belong to Content Project '${composition.contentProjectId}'.`,
    );
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

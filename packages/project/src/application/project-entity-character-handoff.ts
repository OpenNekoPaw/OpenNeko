import {
  createCharacterProductHandoffs,
  type CharacterProductHandoff,
} from '@neko/chara/contracts';
import {
  parseProjectEntityCharacterAssociationFact,
  type ProjectEntityCharacterAssociationFact,
} from '../contracts/project-entity-character-association';

export function projectEntityCharacterHandoffs(input: {
  readonly projectId: string;
  readonly associations: readonly ProjectEntityCharacterAssociationFact[];
  readonly entityId: string;
  readonly characterVersionId?: string;
}): readonly CharacterProductHandoff[] {
  const associations = input.associations.map(parseProjectEntityCharacterAssociationFact);
  const association = associations.find((current) => current.entityId === input.entityId);
  if (!association) {
    throw new Error(
      `Project Entity '${input.entityId}' has no CharacterProject association in Content Project '${input.projectId}'.`,
    );
  }
  if (association.projectId !== input.projectId) {
    throw new Error(`Project Entity association belongs to another Content Project.`);
  }
  return createCharacterProductHandoffs({
    characterProjectId: association.characterProjectId,
    authoringAuthority: { kind: 'project', projectId: input.projectId },
    ...(input.characterVersionId === undefined
      ? {}
      : { characterVersionId: input.characterVersionId }),
  });
}

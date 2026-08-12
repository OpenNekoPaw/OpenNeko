import {
  createCharacterProductHandoffs,
  type CharacterProductHandoff,
} from '@neko/chara/contracts';
import {
  parseContentProjectComposition,
  type ContentProjectComposition,
} from '../contracts/project-composition';

export function projectEntityCharacterHandoffs(input: {
  readonly composition: ContentProjectComposition;
  readonly entityId: string;
  readonly characterVersionId?: string;
}): readonly CharacterProductHandoff[] {
  const composition = parseContentProjectComposition(input.composition);
  const association = composition.entityCharacterAssociations.find(
    (current) => current.entityId === input.entityId,
  );
  if (!association) {
    throw new Error(
      `Project Entity '${input.entityId}' has no CharacterProject association in Content Project '${composition.contentProjectId}'.`,
    );
  }
  return createCharacterProductHandoffs({
    characterProjectId: association.characterProjectId,
    ...(input.characterVersionId === undefined
      ? {}
      : { characterVersionId: input.characterVersionId }),
  });
}

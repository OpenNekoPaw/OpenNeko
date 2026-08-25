import {
  optionalString,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireUniqueIdentities,
} from './codec';

export interface CharacterVersionRelation {
  readonly characterVersionId: string;
  readonly parentCharacterVersionIds: readonly string[];
  readonly changeSummary?: string;
}

export interface CharacterVersionLineage {
  readonly characterProjectId: string;
  readonly relations: readonly CharacterVersionRelation[];
}

export function parseCharacterVersionRelation(value: unknown): CharacterVersionRelation {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'parentCharacterVersionIds', 'changeSummary'],
    'CharacterVersion relation',
  );
  const characterVersionId = requireIdentity(
    record['characterVersionId'],
    'CharacterVersion relation child identity',
  );
  const parentCharacterVersionIds = requireUniqueIdentities(
    requireArray(
      record['parentCharacterVersionIds'],
      (item) => requireIdentity(item, 'CharacterVersion relation parent identity'),
      'CharacterVersion relation parents',
    ),
    (item) => item,
    'CharacterVersion relation parents',
  );
  if (parentCharacterVersionIds.length > 1) {
    throw new Error(
      `CharacterVersion relation '${characterVersionId}' cannot declare multiple parents without an explicit merge workflow.`,
    );
  }
  if (parentCharacterVersionIds.includes(characterVersionId)) {
    throw new Error(`CharacterVersion relation '${characterVersionId}' cannot parent itself.`);
  }
  const changeSummary = optionalString(
    record['changeSummary'],
    'CharacterVersion relation change summary',
  );
  return {
    characterVersionId,
    parentCharacterVersionIds,
    ...(changeSummary === undefined ? {} : { changeSummary }),
  };
}

export function parseCharacterVersionLineage(value: unknown): CharacterVersionLineage {
  const record = requireExactRecord(
    value,
    ['characterProjectId', 'relations'],
    'CharacterVersion lineage',
  );
  const relations = requireUniqueIdentities(
    requireArray(
      record['relations'],
      parseCharacterVersionRelation,
      'CharacterVersion lineage relations',
    ),
    (relation) => relation.characterVersionId,
    'CharacterVersion lineage relations',
  );
  assertAcyclic(relations);
  return {
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'CharacterVersion lineage CharacterProject identity',
    ),
    relations,
  };
}

function assertAcyclic(relations: readonly CharacterVersionRelation[]): void {
  const parentByChild = new Map(
    relations.map((relation) => [
      relation.characterVersionId,
      relation.parentCharacterVersionIds[0],
    ]),
  );
  for (const start of parentByChild.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor !== undefined) {
      if (visited.has(cursor)) {
        throw new Error(`CharacterVersion lineage contains a cycle involving '${cursor}'.`);
      }
      visited.add(cursor);
      cursor = parentByChild.get(cursor);
    }
  }
}

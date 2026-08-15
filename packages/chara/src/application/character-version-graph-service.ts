import {
  parseCharacterProject,
  parseCharacterVersion,
  parseCharacterVersionLineage,
  parseCharacterVersionRelation,
  type CharacterProject,
  type CharacterVersion,
  type CharacterVersionLineage,
} from '@neko/chara/contracts';

export type CharacterVersionComparisonValue =
  | null
  | boolean
  | number
  | string
  | readonly CharacterVersionComparisonValue[]
  | { readonly [key: string]: CharacterVersionComparisonValue };

export type CharacterVersionGraphNodeState = 'declared-root' | 'linked' | 'unlinked';

export interface CharacterVersionGraphNode {
  readonly characterVersionId: string;
  readonly label: string;
  readonly parentCharacterVersionId?: string;
  readonly childCharacterVersionIds: readonly string[];
  readonly ancestorCharacterVersionIds: readonly string[];
  readonly state: CharacterVersionGraphNodeState;
  readonly isHead: boolean;
  readonly isDraftBasis: boolean;
}

export interface CharacterVersionGraphDiagnostic {
  readonly code: 'lineage-child-unavailable' | 'lineage-parent-unavailable' | 'lineage-cycle';
  readonly characterVersionId: string;
  readonly relatedCharacterVersionId?: string;
  readonly message: string;
}

export interface CharacterVersionGraph {
  readonly characterProjectId: string;
  readonly nodes: readonly CharacterVersionGraphNode[];
  readonly rootCharacterVersionIds: readonly string[];
  readonly headCharacterVersionIds: readonly string[];
  readonly unlinkedCharacterVersionIds: readonly string[];
  readonly diagnostics: readonly CharacterVersionGraphDiagnostic[];
}

export interface ProjectCharacterVersionGraphInput {
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
  readonly lineage?: CharacterVersionLineage;
}

export function projectCharacterVersionGraph(
  input: ProjectCharacterVersionGraphInput,
): CharacterVersionGraph {
  const project = parseCharacterProject(input.project);
  const versions = input.versions.map(parseCharacterVersion);
  const ownedVersions = versions.filter(
    (version) => version.characterProjectId === project.characterProjectId,
  );
  const ownedById = new Map(ownedVersions.map((version) => [version.characterVersionId, version]));
  if (ownedById.size !== ownedVersions.length) {
    throw new Error(
      `CharacterProject '${project.characterProjectId}' contains duplicate CharacterVersion identities.`,
    );
  }
  const lineage = parseLineageForProjection(input.lineage);
  if (lineage && lineage.characterProjectId !== project.characterProjectId) {
    throw new Error(
      `CharacterVersion lineage '${lineage.characterProjectId}' does not belong to exact CharacterProject '${project.characterProjectId}'.`,
    );
  }

  const candidateRelations = new Map<
    string,
    { readonly parentCharacterVersionId?: string; readonly declaredRoot: boolean }
  >();
  const diagnostics: CharacterVersionGraphDiagnostic[] = [];
  for (const relation of lineage?.relations ?? []) {
    if (!ownedById.has(relation.characterVersionId)) {
      diagnostics.push({
        code: 'lineage-child-unavailable',
        characterVersionId: relation.characterVersionId,
        message: `Lineage child '${relation.characterVersionId}' is unavailable in CharacterProject '${project.characterProjectId}'.`,
      });
      continue;
    }
    const parentCharacterVersionId = relation.parentCharacterVersionIds[0];
    if (parentCharacterVersionId !== undefined && !ownedById.has(parentCharacterVersionId)) {
      diagnostics.push({
        code: 'lineage-parent-unavailable',
        characterVersionId: relation.characterVersionId,
        relatedCharacterVersionId: parentCharacterVersionId,
        message: `Lineage parent '${parentCharacterVersionId}' is unavailable in CharacterProject '${project.characterProjectId}'.`,
      });
      continue;
    }
    candidateRelations.set(relation.characterVersionId, {
      ...(parentCharacterVersionId === undefined ? {} : { parentCharacterVersionId }),
      declaredRoot: parentCharacterVersionId === undefined,
    });
  }

  const cyclicCharacterVersionIds = findCyclicCharacterVersionIds(candidateRelations);
  const validRelations = new Map(candidateRelations);
  for (const characterVersionId of cyclicCharacterVersionIds) {
    const relation = validRelations.get(characterVersionId);
    validRelations.delete(characterVersionId);
    diagnostics.push({
      code: 'lineage-cycle',
      characterVersionId,
      ...(relation?.parentCharacterVersionId === undefined
        ? {}
        : { relatedCharacterVersionId: relation.parentCharacterVersionId }),
      message: `Lineage relation for '${characterVersionId}' creates a directed cycle and was excluded.`,
    });
  }

  const childrenByParent = new Map<string, string[]>();
  for (const [child, relation] of validRelations) {
    if (relation.parentCharacterVersionId === undefined) continue;
    const children = childrenByParent.get(relation.parentCharacterVersionId) ?? [];
    children.push(child);
    childrenByParent.set(relation.parentCharacterVersionId, children);
  }
  const nodes = ownedVersions.map((version): CharacterVersionGraphNode => {
    const relation = validRelations.get(version.characterVersionId);
    const children = [...(childrenByParent.get(version.characterVersionId) ?? [])].sort();
    const state: CharacterVersionGraphNodeState =
      relation === undefined ? 'unlinked' : relation.declaredRoot ? 'declared-root' : 'linked';
    return {
      characterVersionId: version.characterVersionId,
      label: version.label,
      ...(relation?.parentCharacterVersionId === undefined
        ? {}
        : { parentCharacterVersionId: relation.parentCharacterVersionId }),
      childCharacterVersionIds: children,
      ancestorCharacterVersionIds: collectAncestorCharacterVersionIds(
        version.characterVersionId,
        validRelations,
      ),
      state,
      isHead: relation !== undefined && children.length === 0,
      isDraftBasis: project.draftBasisCharacterVersionId === version.characterVersionId,
    };
  });
  return {
    characterProjectId: project.characterProjectId,
    nodes,
    rootCharacterVersionIds: nodes
      .filter((node) => node.state === 'declared-root')
      .map((node) => node.characterVersionId),
    headCharacterVersionIds: nodes
      .filter((node) => node.isHead)
      .map((node) => node.characterVersionId),
    unlinkedCharacterVersionIds: nodes
      .filter((node) => node.state === 'unlinked')
      .map((node) => node.characterVersionId),
    diagnostics,
  };
}

function parseLineageForProjection(
  lineage: CharacterVersionLineage | undefined,
): CharacterVersionLineage | undefined {
  if (lineage === undefined) return undefined;
  const header = parseCharacterVersionLineage({ ...lineage, relations: [] });
  const relations = lineage.relations.map(parseCharacterVersionRelation);
  const childIds = new Set<string>();
  for (const relation of relations) {
    if (childIds.has(relation.characterVersionId)) {
      throw new Error(
        `CharacterVersion lineage contains duplicate child '${relation.characterVersionId}'.`,
      );
    }
    childIds.add(relation.characterVersionId);
  }
  return { characterProjectId: header.characterProjectId, relations };
}

function findCyclicCharacterVersionIds(
  relations: ReadonlyMap<
    string,
    { readonly parentCharacterVersionId?: string; readonly declaredRoot: boolean }
  >,
): ReadonlySet<string> {
  const cyclic = new Set<string>();
  for (const start of relations.keys()) {
    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let cursor: string | undefined = start;
    while (cursor !== undefined && relations.has(cursor)) {
      const repeatedAt = pathIndex.get(cursor);
      if (repeatedAt !== undefined) {
        for (const characterVersionId of path.slice(repeatedAt)) {
          cyclic.add(characterVersionId);
        }
        break;
      }
      pathIndex.set(cursor, path.length);
      path.push(cursor);
      cursor = relations.get(cursor)?.parentCharacterVersionId;
    }
  }
  return cyclic;
}

function collectAncestorCharacterVersionIds(
  characterVersionId: string,
  relations: ReadonlyMap<
    string,
    { readonly parentCharacterVersionId?: string; readonly declaredRoot: boolean }
  >,
): readonly string[] {
  const ancestors: string[] = [];
  let parentCharacterVersionId = relations.get(characterVersionId)?.parentCharacterVersionId;
  while (parentCharacterVersionId !== undefined) {
    ancestors.unshift(parentCharacterVersionId);
    parentCharacterVersionId = relations.get(parentCharacterVersionId)?.parentCharacterVersionId;
  }
  return ancestors;
}

export interface CharacterVersionComparisonGroup {
  readonly group:
    | 'identity'
    | 'background-origin'
    | 'canon'
    | 'knowledge'
    | 'behavior'
    | 'expression'
    | 'representation'
    | 'voice'
    | 'accepted-evidence';
  readonly changed: boolean;
  readonly before: CharacterVersionComparisonValue;
  readonly after: CharacterVersionComparisonValue;
}

export interface CharacterVersionComparison {
  readonly beforeCharacterVersionId: string;
  readonly afterCharacterVersionId: string;
  readonly groups: readonly CharacterVersionComparisonGroup[];
}

export function compareCharacterVersions(
  beforeValue: CharacterVersion,
  afterValue: CharacterVersion,
): CharacterVersionComparison {
  const before = parseCharacterVersion(beforeValue);
  const after = parseCharacterVersion(afterValue);
  const definitionBefore = before.definition;
  const definitionAfter = after.definition;
  return {
    beforeCharacterVersionId: before.characterVersionId,
    afterCharacterVersionId: after.characterVersionId,
    groups: [
      changed(
        'identity',
        [before.characterProjectId, before.label, definitionBefore.summary],
        [after.characterProjectId, after.label, definitionAfter.summary],
      ),
      changed(
        'background-origin',
        [definitionBefore.backgroundStory, definitionBefore.originSetting],
        [definitionAfter.backgroundStory, definitionAfter.originSetting],
      ),
      changed('canon', definitionBefore.canon, definitionAfter.canon),
      changed('knowledge', definitionBefore.knowledgeBoundary, definitionAfter.knowledgeBoundary),
      changed('behavior', definitionBefore.behaviorPolicy, definitionAfter.behaviorPolicy),
      changed('expression', definitionBefore.expressionPolicy, definitionAfter.expressionPolicy),
      changed(
        'representation',
        [definitionBefore.representationRefs, definitionBefore.representationDefaults],
        [definitionAfter.representationRefs, definitionAfter.representationDefaults],
      ),
      changed('voice', definitionBefore.voiceDefaults, definitionAfter.voiceDefaults),
      changed('accepted-evidence', before.acceptedEvidenceIds, after.acceptedEvidenceIds),
    ],
  };
}

function changed(
  group: CharacterVersionComparisonGroup['group'],
  before: unknown,
  after: unknown,
): CharacterVersionComparisonGroup {
  const canonicalBefore = toJsonValue(before);
  const canonicalAfter = toJsonValue(after);
  return {
    group,
    changed: JSON.stringify(canonicalBefore) !== JSON.stringify(canonicalAfter),
    before: canonicalBefore,
    after: canonicalAfter,
  };
}

function toJsonValue(value: unknown): CharacterVersionComparisonValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    const result: Record<string, CharacterVersionComparisonValue> = {};
    for (const [key, nested] of Object.entries(value)) result[key] = toJsonValue(nested);
    return result;
  }
  throw new Error('CharacterVersion comparison contains a non-JSON value.');
}

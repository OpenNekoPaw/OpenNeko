import type { CharacterAuthoringCatalog } from '@neko/chara-domain/application';
import type {
  WorldAuthoringCatalog,
  WorldDurableRecordDiagnostic,
} from '@neko/world-domain/application';
import type {
  ProjectEntityDiagnostic,
  ProjectEntityManagementProjection,
} from '@neko/entity-domain';
import type { ProjectEntityCharacterAssociationCatalog } from './project-fact-ports';
import {
  parseProjectContentProjection,
  type ProjectContentCharacterItem,
  type ProjectContentDiagnostic,
  type ProjectContentElementItem,
  type ProjectContentProjection,
  type ProjectContentWorldItem,
} from '../contracts/project-content';
import {
  parseProjectEntityCharacterResourceProjection,
  type ProjectEntityCharacterResourceProjection,
} from '../contracts/project-entity-character-resource-projection';

export interface ProjectContentEntityCatalog {
  readonly projectId: string;
  readonly projections: readonly ProjectEntityManagementProjection[];
  readonly diagnostics: readonly ProjectEntityDiagnostic[];
}

export function projectContentProjection(input: {
  readonly projectId: string;
  readonly associations: ProjectEntityCharacterAssociationCatalog;
  readonly characters: CharacterAuthoringCatalog;
  readonly characterAssociations: readonly ProjectEntityCharacterResourceProjection[];
  readonly entities: ProjectContentEntityCatalog;
  readonly worlds: WorldAuthoringCatalog;
}): ProjectContentProjection {
  requireProjectScope(input.entities.projectId, input.projectId, 'Entity');
  const characterAssociations = input.characterAssociations.map(
    parseProjectEntityCharacterResourceProjection,
  );
  requireExactCharacterAssociations(input.associations.associations, characterAssociations);
  const associatedEntityIds = new Set(
    input.associations.associations.map((association) => association.entityId),
  );
  const diagnostics: ProjectContentDiagnostic[] = [];

  const characters: ProjectContentCharacterItem[] = characterAssociations.map((association) => ({
    owner: 'character' as const,
    characterProjectId: association.characterProjectId,
    entityId: association.entityId,
    ...(association.displayName === undefined ? {} : { label: association.displayName }),
    availability: association.availability,
    ...(association.diagnostic === undefined ? {} : { diagnostic: association.diagnostic }),
  }));

  const associatedCharacterIds = new Set(
    input.associations.associations.map((association) => association.characterProjectId),
  );
  for (const project of input.characters.projects) {
    if (associatedCharacterIds.has(project.characterProjectId)) continue;
    characters.push({
      owner: 'character',
      characterProjectId: project.characterProjectId,
      label: project.displayName,
      availability: 'needs-attention',
      diagnostic: `CharacterProject '${project.characterProjectId}' has no Project Entity association.`,
    });
  }
  const projectedCharacterIds = new Set(characters.map((item) => item.characterProjectId));
  for (const diagnostic of input.characters.diagnostics) {
    if (
      diagnostic.recordKind !== 'character-project' ||
      projectedCharacterIds.has(diagnostic.recordId)
    ) {
      continue;
    }
    characters.push({
      owner: 'character',
      characterProjectId: diagnostic.recordId,
      availability: 'needs-attention',
      diagnostic: diagnostic.message,
    });
  }
  diagnostics.push(
    ...input.associations.diagnostics.map((diagnostic) => ({
      owner: 'project' as const,
      group: 'characters' as const,
      recordId: diagnostic.recordName,
      message: diagnostic.message,
    })),
  );

  const worlds: ProjectContentWorldItem[] = input.worlds.projects.map((project) => {
    const diagnostic = findWorldDiagnostic(input.worlds.diagnostics, project.worldProjectId);
    if (diagnostic) {
      return {
        owner: 'world' as const,
        worldProjectId: project.worldProjectId,
        availability: 'needs-attention' as const,
        diagnostic: diagnostic.message,
      };
    }
    return {
      owner: 'world' as const,
      worldProjectId: project.worldProjectId,
      label: project.title,
      availability: 'available' as const,
    };
  });
  const projectedWorldIds = new Set(worlds.map((world) => world.worldProjectId));
  for (const diagnostic of input.worlds.diagnostics) {
    if (diagnostic.recordKind !== 'world-project' || projectedWorldIds.has(diagnostic.recordId)) {
      continue;
    }
    worlds.push({
      owner: 'world',
      worldProjectId: diagnostic.recordId,
      availability: 'needs-attention',
      diagnostic: diagnostic.message,
    });
  }

  const elements = input.entities.projections.flatMap<ProjectContentElementItem>((projection) => {
    if (projection.status === 'candidate' || associatedEntityIds.has(projection.entity.entityId)) {
      return [];
    }
    const label = projection.entity.names.display ?? projection.entity.names.canonical;
    if (projection.status === 'needs-attention') {
      const diagnostic = `Project Entity '${projection.entity.entityId}' has unavailable representation bindings.`;
      return [
        {
          owner: 'project-entity' as const,
          entityId: projection.entity.entityId,
          entityKind: projection.entity.kind,
          label,
          updatedAt: projection.entity.updatedAt,
          availability: 'needs-attention' as const,
          diagnostic,
        },
      ];
    }
    return [
      {
        owner: 'project-entity' as const,
        entityId: projection.entity.entityId,
        entityKind: projection.entity.kind,
        label,
        updatedAt: projection.entity.updatedAt,
        availability:
          projection.status === 'deprecated' ? ('deprecated' as const) : ('available' as const),
      },
    ];
  });

  const candidates = input.entities.projections.flatMap((projection) =>
    projection.status === 'candidate'
      ? [
          {
            owner: 'entity-candidate' as const,
            candidateId: projection.candidate.candidateId,
            entityKind: projection.candidate.kind,
            label:
              projection.candidate.proposedNames.display ??
              projection.candidate.proposedNames.canonical,
            freshness: projection.candidate.freshness,
            ...(projection.candidate.confidence === undefined
              ? {}
              : { confidence: projection.candidate.confidence }),
            evidenceCount: projection.candidate.evidence.length,
            ...latestObservedAt(projection.candidate.evidence),
          },
        ]
      : [],
  );

  diagnostics.push(
    ...input.entities.diagnostics.map((diagnostic) => ({
      owner: 'project-entity' as const,
      group: diagnostic.candidateId === undefined ? ('elements' as const) : ('candidates' as const),
      ...(diagnostic.entityId === undefined && diagnostic.candidateId === undefined
        ? {}
        : { recordId: diagnostic.entityId ?? diagnostic.candidateId }),
      message: diagnostic.message,
    })),
  );

  return parseProjectContentProjection({
    projectId: input.projectId,
    characters,
    worlds,
    elements,
    candidates,
    diagnostics,
  });
}

function latestObservedAt(
  evidence: readonly { readonly observedAt?: string }[],
): Readonly<{ updatedAt?: string }> {
  const observedAt = evidence
    .flatMap((item) => (item.observedAt === undefined ? [] : [item.observedAt]))
    .sort((left, right) => right.localeCompare(left))[0];
  return observedAt === undefined ? {} : { updatedAt: observedAt };
}

function requireExactCharacterAssociations(
  associations: ProjectEntityCharacterAssociationCatalog['associations'],
  projections: readonly ProjectEntityCharacterResourceProjection[],
): void {
  const expected = new Map(
    associations.map((association) => [association.characterProjectId, association.entityId]),
  );
  if (projections.length !== expected.size) {
    throw new Error('Project Content Character projections do not match Project associations.');
  }
  const seen = new Set<string>();
  for (const projection of projections) {
    if (
      seen.has(projection.characterProjectId) ||
      expected.get(projection.characterProjectId) !== projection.entityId
    ) {
      throw new Error('Project Content Character projections do not match Project associations.');
    }
    seen.add(projection.characterProjectId);
  }
}

function findWorldDiagnostic(
  diagnostics: readonly WorldDurableRecordDiagnostic[],
  worldProjectId: string,
): WorldDurableRecordDiagnostic | undefined {
  return diagnostics.find(
    (diagnostic) =>
      diagnostic.recordKind === 'world-project' && diagnostic.recordId === worldProjectId,
  );
}

function requireProjectScope(actual: string, expected: string, owner: string): void {
  if (actual !== expected) {
    throw new Error(`${owner} catalog does not match Content Project '${expected}'.`);
  }
}

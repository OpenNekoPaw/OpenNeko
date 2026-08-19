import {
  parseCharacterDefinition,
  type CharacterDefinition,
  type CharacterProject,
  type CharacterReviewStatus,
} from '@neko/chara/contracts';

import type {
  CharacterAuthoringCatalogPort,
  CharacterAuthoringCatalogScope,
} from './character-durable-catalog';
import {
  isFreshCharacterCreationTarget,
  type CharacterAuthoringService,
} from './character-authoring-service';

export const CHARACTER_DSH_TOOL_NAME = 'openneko.character' as const;
export const CHARACTER_DSH_TOOL_OPERATIONS = ['query', 'fill-draft'] as const;
export const CHARACTER_DSH_MAX_PROJECTED_VERSIONS = 32;

export type CharacterDshToolOperation = (typeof CHARACTER_DSH_TOOL_OPERATIONS)[number];

export interface CharacterDshToolQueryInput {
  readonly characterProjectId: string;
}

export interface CharacterDshToolFillDraftInput {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly definition: CharacterDefinition;
}

export type CharacterDshToolInput =
  | { readonly operation: 'query'; readonly input: CharacterDshToolQueryInput }
  | { readonly operation: 'fill-draft'; readonly input: CharacterDshToolFillDraftInput };

export interface CharacterDshVersionFacts {
  readonly characterVersionId: string;
  readonly label: string;
  readonly lifecycle: 'published';
  readonly publishedAt: string;
}

export interface CharacterDshProjectFacts {
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly reviewStatus: CharacterReviewStatus;
  readonly isFreshTarget: boolean;
  readonly draft: {
    readonly hasSummary: boolean;
    readonly hasBackground: boolean;
    readonly hasOrigin: boolean;
    readonly canonCount: number;
    readonly knowledgeBoundaryCount: number;
    readonly behaviorPolicyCount: number;
    readonly expressionPolicyCount: number;
    readonly representationCount: number;
  };
  readonly evidenceCount: number;
  readonly candidateCount: number;
  readonly versionCount: number;
  readonly versions: readonly CharacterDshVersionFacts[];
  readonly versionsTruncated: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function decodeCharacterDshToolInput(
  operation: unknown,
  input: unknown,
): CharacterDshToolInput {
  if (operation === 'query') {
    const record = requireRecord(input, 'input');
    requireOnlyKeys(record, ['characterProjectId'], 'input');
    return {
      operation,
      input: {
        characterProjectId: requireIdentity(record.characterProjectId, 'input.characterProjectId'),
      },
    };
  }
  if (operation === 'fill-draft') {
    const record = requireRecord(input, 'input');
    requireOnlyKeys(record, ['characterProjectId', 'displayName', 'definition'], 'input');
    return {
      operation,
      input: {
        characterProjectId: requireIdentity(record.characterProjectId, 'input.characterProjectId'),
        displayName: requireIdentity(record.displayName, 'input.displayName'),
        definition: parseCharacterDefinition(record.definition),
      },
    };
  }
  throw new Error(
    `Character DSH tool operation must be one of ${CHARACTER_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

export class CharacterDshAuthoringService {
  constructor(
    private readonly options: {
      readonly scope: Extract<CharacterAuthoringCatalogScope, { readonly kind: 'project' }>;
      readonly characterProjectId: string;
      readonly catalog: CharacterAuthoringCatalogPort;
      readonly authoring: Pick<CharacterAuthoringService, 'fillFreshDraft'>;
    },
  ) {}

  async query(
    input: CharacterDshToolQueryInput,
    signal?: AbortSignal,
  ): Promise<CharacterDshProjectFacts> {
    this.requireExactTarget(input.characterProjectId);
    signal?.throwIfAborted();
    const catalog = await this.options.catalog.readAuthoringCatalog(signal);
    if (!sameScope(catalog.scope, this.options.scope)) {
      throw diagnosticError(
        'CHARACTER_DSH_AUTHORITY_MISMATCH',
        'Character authoring catalog does not match its exact Project authority.',
      );
    }
    const project = catalog.projects.find(
      (candidate) => candidate.characterProjectId === input.characterProjectId,
    );
    if (!project) {
      const diagnostic = catalog.diagnostics.find(
        (candidate) =>
          candidate.recordKind === 'character-project' &&
          candidate.recordId === input.characterProjectId,
      );
      throw diagnosticError(
        'CHARACTER_DSH_PROJECT_UNAVAILABLE',
        diagnostic?.message ?? `CharacterProject '${input.characterProjectId}' is unavailable.`,
      );
    }
    const versions = catalog.versions.filter(
      (candidate) => candidate.characterProjectId === input.characterProjectId,
    );
    return projectCharacterDshFacts(project, versions);
  }

  async fillDraft(
    input: CharacterDshToolFillDraftInput,
    signal?: AbortSignal,
  ): Promise<CharacterDshProjectFacts> {
    this.requireExactTarget(input.characterProjectId);
    await this.options.authoring.fillFreshDraft(
      {
        characterProjectId: input.characterProjectId,
        displayName: input.displayName,
        draft: input.definition,
      },
      signal,
    );
    return this.query({ characterProjectId: input.characterProjectId }, signal);
  }

  private requireExactTarget(characterProjectId: string): void {
    if (characterProjectId !== this.options.characterProjectId) {
      throw diagnosticError(
        'CHARACTER_DSH_TARGET_MISMATCH',
        'Character Tool input targets another CharacterProject.',
      );
    }
  }
}

export function projectCharacterDshFacts(
  project: CharacterProject,
  versions: readonly {
    readonly characterVersionId: string;
    readonly characterProjectId: string;
    readonly label: string;
    readonly publishedAt: string;
  }[],
): CharacterDshProjectFacts {
  const matchingVersions = versions.filter(
    (version) => version.characterProjectId === project.characterProjectId,
  );
  const draft = project.draft;
  return {
    characterProjectId: project.characterProjectId,
    displayName: project.displayName,
    reviewStatus: project.reviewStatus,
    isFreshTarget: isFreshCharacterCreationTarget(project),
    draft: {
      hasSummary: draft.summary.length > 0,
      hasBackground:
        draft.backgroundStory.overview.length > 0 ||
        draft.backgroundStory.origins.length > 0 ||
        draft.backgroundStory.personalHistory.length > 0 ||
        draft.backgroundStory.formativeEvents.length > 0 ||
        draft.backgroundStory.establishedRelationships.length > 0,
      hasOrigin:
        draft.originSetting.overview.length > 0 ||
        draft.originSetting.eras.length > 0 ||
        draft.originSetting.cultures.length > 0 ||
        draft.originSetting.socialEnvironment.length > 0 ||
        draft.originSetting.importantPlaces.length > 0 ||
        draft.originSetting.organizations.length > 0 ||
        draft.originSetting.believedRules.length > 0,
      canonCount: draft.canon.length,
      knowledgeBoundaryCount: draft.knowledgeBoundary.length,
      behaviorPolicyCount: draft.behaviorPolicy.length,
      expressionPolicyCount: draft.expressionPolicy.length,
      representationCount: draft.representationRefs.length,
    },
    evidenceCount: project.evidence.length,
    candidateCount: project.candidates.length,
    versionCount: matchingVersions.length,
    versions: matchingVersions.slice(0, CHARACTER_DSH_MAX_PROJECTED_VERSIONS).map((version) => ({
      characterVersionId: version.characterVersionId,
      label: version.label,
      lifecycle: 'published',
      publishedAt: version.publishedAt,
    })),
    versionsTruncated: matchingVersions.length > CHARACTER_DSH_MAX_PROJECTED_VERSIONS,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function sameScope(
  actual: CharacterAuthoringCatalogScope,
  expected: Extract<CharacterAuthoringCatalogScope, { readonly kind: 'project' }>,
): boolean {
  return actual.kind === 'project' && actual.projectId === expected.projectId;
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).some(
      (key) => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(input, key),
    )
  ) {
    throw new Error(`${field} must be a plain JSON object.`);
  }
  return input as Record<string, unknown>;
}

function requireOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  const unknownKey = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknownKey !== undefined) throw new Error(`${field}.${unknownKey} is not supported.`);
}

function requireIdentity(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.trim().length === 0 || input !== input.trim()) {
    throw new Error(`${field} must be a non-empty normalized identity.`);
  }
  return input;
}

function diagnosticError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}

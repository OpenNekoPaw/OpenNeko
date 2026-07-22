import type {
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  CreativeEntityRepresentationHint,
  EntityRepresentationBinding,
  EntityRepresentationTarget,
  NpcProfileFact,
  NpcProfileFactSource,
  NpcProfileRelationshipValue,
  NpcProfileRepresentationBinding,
  NpcProfileSource,
  NpcProfileSparsity,
  NpcProfileSparsityScore,
  NpcSerializableValue,
  VisualIdentityDraft,
} from '@neko/shared';
import { contentLocatorKey } from '@neko/shared';

export interface NpcProfileRepresentationMetadata {
  readonly label?: string;
  readonly summary?: string;
  readonly facts?: readonly NpcProfileFact[];
}

export interface NpcProfileAssemblerReaders {
  readonly getEntity: (entityId: string) => Promise<CreativeEntity | undefined>;
  readonly getCandidate?: (candidateId: string) => Promise<CreativeEntityCandidate | undefined>;
  readonly listBindings?: (
    entityRef: CreativeEntityRef,
  ) => Promise<readonly EntityRepresentationBinding[]>;
  readonly listVisualDrafts?: (
    entityRef: CreativeEntityRef,
  ) => Promise<readonly VisualIdentityDraft[]>;
  readonly listRelationships?: (
    entityRef: CreativeEntityRef,
  ) => Promise<readonly CreativeEntityRelationshipProjection[]>;
  readonly listOccurrences?: (
    entityRef: CreativeEntityRef,
  ) => Promise<readonly CreativeEntityOccurrenceProjection[]>;
  readonly listRepresentationHints?: (
    entityRef: CreativeEntityRef,
  ) => Promise<readonly CreativeEntityRepresentationHint[]>;
  readonly describeRepresentation?: (
    representation: EntityRepresentationTarget,
    entityRef: CreativeEntityRef,
  ) => Promise<NpcProfileRepresentationMetadata | undefined>;
}

export interface AssembleNpcProfileInput {
  readonly entityRef: CreativeEntityRef;
  readonly userSupplements?: string;
  readonly suggestedFacts?: readonly NpcProfileFact[];
}

export type NpcProfileAssemblyResult =
  | {
      readonly status: 'assembled';
      readonly profile: NpcProfileSource;
    }
  | {
      readonly status: 'missing-entity';
      readonly entityRef: CreativeEntityRef;
      readonly reason: string;
    }
  | {
      readonly status: 'provider-unavailable';
      readonly entityRef: CreativeEntityRef;
      readonly provider: keyof NpcProfileAssemblerReaders;
      readonly reason: string;
    };

export class NpcProfileAssembler {
  constructor(private readonly readers: NpcProfileAssemblerReaders) {}

  async assembleProfile(input: AssembleNpcProfileInput): Promise<NpcProfileAssemblyResult> {
    const entity = await this.resolveEntity(input.entityRef);
    if (!entity) {
      return {
        status: 'missing-entity',
        entityRef: input.entityRef,
        reason: `Creative entity not found: ${input.entityRef.entityId}`,
      };
    }

    if (entity.kind !== 'character') {
      return {
        status: 'missing-entity',
        entityRef: input.entityRef,
        reason: `NPC profile requires a character entity, got ${entity.kind}.`,
      };
    }

    const entityRef = toEntityRef(entity, input.entityRef);
    const facts = this.collectEntityFacts(entity);
    const [bindings, drafts, relationships, occurrences, representationHints] = await Promise.all([
      this.callOptionalReader('listBindings', entityRef),
      this.callOptionalReader('listVisualDrafts', entityRef),
      this.callOptionalReader('listRelationships', entityRef),
      this.callOptionalReader('listOccurrences', entityRef),
      this.callOptionalReader('listRepresentationHints', entityRef),
    ]);

    if (bindings.status === 'unavailable') return this.providerUnavailable(input, bindings);
    if (drafts.status === 'unavailable') return this.providerUnavailable(input, drafts);
    if (relationships.status === 'unavailable')
      return this.providerUnavailable(input, relationships);
    if (occurrences.status === 'unavailable') return this.providerUnavailable(input, occurrences);
    if (representationHints.status === 'unavailable') {
      return this.providerUnavailable(input, representationHints);
    }

    const representationBindings = this.collectRepresentationBindings(
      entityRef,
      bindings.value,
      representationHints.value,
    );
    const representationFacts = await this.collectRepresentationFacts(
      entityRef,
      representationBindings,
    );
    const visualFacts = this.collectVisualFacts(drafts.value);
    const relationshipFacts = this.collectRelationshipFacts(entityRef, relationships.value);
    const occurrenceFacts = this.collectOccurrenceFacts(occurrences.value);
    const userSupplementFacts = collectUserSupplementFacts(input.userSupplements);
    const suggestedFacts = input.suggestedFacts ?? [];
    const dialogueSamples = collectDialogueSamples(entity, occurrences.value);
    const sceneAppearances = collectSceneAppearances(occurrences.value);
    const allFacts = dedupeFacts([
      ...facts,
      ...representationFacts,
      ...visualFacts,
      ...occurrenceFacts,
      ...userSupplementFacts,
      ...suggestedFacts,
    ]);
    const sparsityScore = scoreProfile({
      facts: allFacts,
      relationships: relationshipFacts,
      dialogueSamples,
      sceneAppearances,
      representationBindings,
    });

    return {
      status: 'assembled',
      profile: {
        entityRef,
        displayName: entity.displayName ?? entity.canonicalName,
        aliases: entity.aliases,
        facts: allFacts,
        relationships: relationshipFacts,
        representationBindings,
        dialogueSamples,
        sceneAppearances,
        userSupplements: input.userSupplements,
        sparsity: sparsityScore.level,
        sparsityScore,
      },
    };
  }

  private async resolveEntity(entityRef: CreativeEntityRef): Promise<CreativeEntity | undefined> {
    const entity = await this.readers.getEntity(entityRef.entityId);
    if (entity) return entity;

    const candidate = await this.readers.getCandidate?.(entityRef.entityId);
    if (!candidate) return undefined;

    return {
      id: candidate.resolvedEntityRef?.entityId ?? candidate.id,
      kind: candidate.kind,
      canonicalName: candidate.name,
      aliases: candidate.aliases ?? [],
      status: candidate.status === 'confirmed' ? 'confirmed' : 'candidate',
      metadata: {
        candidateId: candidate.id,
        provenance: candidate.provenance,
        ...(candidate.metadata ?? {}),
      },
    };
  }

  private collectEntityFacts(entity: CreativeEntity): NpcProfileFact[] {
    const facts: NpcProfileFact[] = [
      fact('identity.name', entity.canonicalName, 'registry', 'confirmed', {
        label: 'Canonical name',
        sourceRef: entity.id,
      }),
    ];

    if (entity.displayName && entity.displayName !== entity.canonicalName) {
      facts.push(
        fact('identity.displayName', entity.displayName, 'registry', 'confirmed', {
          label: 'Display name',
          sourceRef: entity.id,
        }),
      );
    }

    for (const key of ['role', 'ageRange', 'age', 'gender', 'notes', 'personality'] as const) {
      const value = entity.metadata?.[key];
      if (isNpcSerializableValue(value)) {
        facts.push(
          fact(`metadata.${key}`, value, 'registry', 'confirmed', { sourceRef: entity.id }),
        );
      }
    }

    return facts;
  }

  private collectRepresentationBindings(
    entityRef: CreativeEntityRef,
    bindings: readonly EntityRepresentationBinding[],
    hints: readonly CreativeEntityRepresentationHint[],
  ): readonly NpcProfileRepresentationBinding[] {
    const fromBindings = bindings
      .filter((binding) => binding.entityId === entityRef.entityId && binding.status !== 'rejected')
      .map((binding): NpcProfileRepresentationBinding => ({
        role: binding.role,
        representation: binding.representation,
        isDefault: binding.isDefault,
        sourceRef: binding.id,
      }));
    const fromHints = hints
      .filter((hint) => isSameEntityRef(hint.entityRef, entityRef))
      .flatMap((hint) =>
        hint.roles.map((role): NpcProfileRepresentationBinding => ({
          role,
          representation: hint.representation,
          sourceRef: hint.source.sourceRef,
          summary: hint.reason,
        })),
      );

    return dedupeRepresentationBindings([...fromBindings, ...fromHints]);
  }

  private async collectRepresentationFacts(
    entityRef: CreativeEntityRef,
    bindings: readonly NpcProfileRepresentationBinding[],
  ): Promise<readonly NpcProfileFact[]> {
    if (!this.readers.describeRepresentation) return [];

    const facts: NpcProfileFact[] = [];
    for (const binding of bindings) {
      const metadata = await this.readers.describeRepresentation(binding.representation, entityRef);
      if (!metadata) continue;
      if (metadata.label) {
        facts.push(
          fact(
            `representation.${binding.role}.label`,
            metadata.label,
            'representation-metadata',
            'confirmed',
            { sourceRef: contentLocatorKey(binding.representation) },
          ),
        );
      }
      if (metadata.summary) {
        facts.push(
          fact(
            `representation.${binding.role}.summary`,
            metadata.summary,
            'representation-metadata',
            'confirmed',
            { sourceRef: contentLocatorKey(binding.representation) },
          ),
        );
      }
      facts.push(...(metadata.facts ?? []));
    }
    return facts;
  }

  private collectVisualFacts(drafts: readonly VisualIdentityDraft[]): NpcProfileFact[] {
    return drafts.flatMap((draft) =>
      (draft.extractedVisualFacts ?? [])
        .filter((visualFact) => visualFact.accepted !== false)
        .map((visualFact) =>
          fact(`visual.${visualFact.key}`, visualFact.value, 'visual-draft', 'confirmed', {
            confidence: visualFact.confidence,
            sourceRef: draft.id,
          }),
        ),
    );
  }

  private collectRelationshipFacts(
    entityRef: CreativeEntityRef,
    relationships: readonly CreativeEntityRelationshipProjection[],
  ): Array<NpcProfileFact<NpcProfileRelationshipValue>> {
    return relationships
      .filter((relationship) => isSameEntityRef(relationship.from, entityRef))
      .map((relationship) =>
        relationshipFact(
          `relationship.${relationship.to.entityId}.${relationship.type}`,
          {
            name: relationship.to.entityId,
            relation: relationship.type,
            entityRef: relationship.to,
            summary: relationship.strength,
          },
          'relationship-graph',
          'confirmed',
          {
            confidence: relationship.confidence,
            sourceRef: relationship.source.sourceRef,
            providerId: relationship.source.providerId,
          },
        ),
      );
  }

  private collectOccurrenceFacts(
    occurrences: readonly CreativeEntityOccurrenceProjection[],
  ): NpcProfileFact[] {
    return occurrences.map((occurrence) =>
      fact('occurrence.scene', occurrence.label, 'occurrence-index', 'confirmed', {
        sourceRef: occurrence.location,
        providerId: occurrence.source.providerId,
      }),
    );
  }

  private async callOptionalReader(
    key: 'listBindings',
    entityRef: CreativeEntityRef,
  ): Promise<ReaderResult<readonly EntityRepresentationBinding[]>>;
  private async callOptionalReader(
    key: 'listVisualDrafts',
    entityRef: CreativeEntityRef,
  ): Promise<ReaderResult<readonly VisualIdentityDraft[]>>;
  private async callOptionalReader(
    key: 'listRelationships',
    entityRef: CreativeEntityRef,
  ): Promise<ReaderResult<readonly CreativeEntityRelationshipProjection[]>>;
  private async callOptionalReader(
    key: 'listOccurrences',
    entityRef: CreativeEntityRef,
  ): Promise<ReaderResult<readonly CreativeEntityOccurrenceProjection[]>>;
  private async callOptionalReader(
    key: 'listRepresentationHints',
    entityRef: CreativeEntityRef,
  ): Promise<ReaderResult<readonly CreativeEntityRepresentationHint[]>>;
  private async callOptionalReader(
    key: keyof OptionalNpcProfileReaders,
    entityRef: CreativeEntityRef,
  ): Promise<ReaderResult<readonly unknown[]>> {
    const reader = this.readers[key];
    if (!reader) {
      return { status: 'available', value: [] };
    }
    try {
      const value = await reader(entityRef);
      return { status: 'available', value };
    } catch (error) {
      return {
        status: 'unavailable',
        provider: key,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private providerUnavailable(
    input: AssembleNpcProfileInput,
    result: Extract<ReaderResult<unknown>, { status: 'unavailable' }>,
  ): NpcProfileAssemblyResult {
    return {
      status: 'provider-unavailable',
      entityRef: input.entityRef,
      provider: result.provider,
      reason: result.reason,
    };
  }
}

type OptionalNpcProfileReaders = Pick<
  NpcProfileAssemblerReaders,
  | 'listBindings'
  | 'listVisualDrafts'
  | 'listRelationships'
  | 'listOccurrences'
  | 'listRepresentationHints'
>;

type ReaderResult<TValue> =
  | { readonly status: 'available'; readonly value: TValue }
  | {
      readonly status: 'unavailable';
      readonly provider: keyof NpcProfileAssemblerReaders;
      readonly reason: string;
    };

interface FactOptions {
  readonly label?: string;
  readonly sourceRef?: string;
  readonly providerId?: string;
  readonly confidence?: number;
}

function fact<TValue extends NpcSerializableValue>(
  key: string,
  value: TValue,
  source: NpcProfileFactSource,
  authority: NpcProfileFact['authority'],
  options: FactOptions = {},
): NpcProfileFact<TValue> {
  return {
    key,
    value,
    source,
    authority,
    ...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.sourceRef ? { sourceRef: options.sourceRef } : {}),
    ...(options.providerId ? { providerId: options.providerId } : {}),
  };
}

function relationshipFact(
  key: string,
  value: NpcProfileRelationshipValue,
  source: NpcProfileFactSource,
  authority: NpcProfileFact['authority'],
  options: FactOptions = {},
): NpcProfileFact<NpcProfileRelationshipValue> {
  return {
    key,
    value,
    source,
    authority,
    ...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
    ...(options.sourceRef ? { sourceRef: options.sourceRef } : {}),
    ...(options.providerId ? { providerId: options.providerId } : {}),
  };
}

function collectUserSupplementFacts(
  userSupplements: string | undefined,
): readonly NpcProfileFact[] {
  if (!userSupplements?.trim()) return [];
  return [
    fact('user.supplement', userSupplements, 'user-supplement', 'suggested', {
      label: 'User supplement',
    }),
  ];
}

function collectDialogueSamples(
  entity: CreativeEntity,
  occurrences: readonly CreativeEntityOccurrenceProjection[],
): readonly string[] {
  const metadataSamples = readStringArray(entity.metadata?.['dialogueSamples']);
  const occurrenceSamples = occurrences
    .map((occurrence) => occurrence.detail)
    .filter((detail): detail is string => Boolean(detail?.trim()))
    .filter((detail) => /[：:「"']/.test(detail));
  return uniqueStrings([...metadataSamples, ...occurrenceSamples]);
}

function collectSceneAppearances(
  occurrences: readonly CreativeEntityOccurrenceProjection[],
): readonly string[] {
  return uniqueStrings(occurrences.map((occurrence) => occurrence.location));
}

function scoreProfile(input: {
  readonly facts: readonly NpcProfileFact[];
  readonly relationships: readonly NpcProfileFact<NpcProfileRelationshipValue>[];
  readonly dialogueSamples: readonly string[];
  readonly sceneAppearances: readonly string[];
  readonly representationBindings: readonly NpcProfileRepresentationBinding[];
}): NpcProfileSparsityScore {
  const confirmedFactCount = input.facts.filter(
    (factItem) => factItem.authority === 'confirmed',
  ).length;
  const suggestedFactCount = input.facts.filter(
    (factItem) => factItem.authority === 'suggested',
  ).length;
  const hasIdentity = input.facts.some((factItem) => factItem.key === 'identity.name');
  const hasRole = input.facts.some((factItem) => factItem.key === 'metadata.role');
  const hasVisual = input.facts.some((factItem) => factItem.key.startsWith('visual.'));
  const hasRepresentation = input.representationBindings.length > 0;
  const hasRelationship = input.relationships.length > 0;
  const hasDialogue = input.dialogueSamples.length > 0;
  const hasScene = input.sceneAppearances.length > 0;
  const available = [
    hasIdentity,
    hasRole,
    hasVisual || hasRepresentation,
    hasRelationship,
    hasDialogue,
    hasScene,
  ].filter(Boolean).length;
  const score = available / 6;
  const level: NpcProfileSparsity = score < 0.34 ? 'thin' : score < 0.67 ? 'partial' : 'rich';
  const missingFactKeys = [
    !hasRole ? 'metadata.role' : undefined,
    !hasVisual && !hasRepresentation ? 'visual' : undefined,
    !hasRelationship ? 'relationships' : undefined,
    !hasDialogue ? 'dialogueSamples' : undefined,
    !hasScene ? 'sceneAppearances' : undefined,
  ].filter((key): key is string => Boolean(key));

  return {
    level,
    score,
    confirmedFactCount,
    suggestedFactCount,
    relationshipCount: input.relationships.length,
    dialogueSampleCount: input.dialogueSamples.length,
    missingFactKeys,
  };
}

function toEntityRef(entity: CreativeEntity, requested: CreativeEntityRef): CreativeEntityRef {
  return {
    entityId: entity.id,
    entityKind: entity.kind,
    ...(requested.projectRoot ? { projectRoot: requested.projectRoot } : {}),
    ...(requested.source ? { source: requested.source } : {}),
  };
}

function isSameEntityRef(
  left: CreativeEntityRef | undefined,
  right: CreativeEntityRef | undefined,
): boolean {
  return Boolean(
    left && right && left.entityId === right.entityId && left.entityKind === right.entityKind,
  );
}

function dedupeFacts(facts: readonly NpcProfileFact[]): readonly NpcProfileFact[] {
  const seen = new Set<string>();
  const deduped: NpcProfileFact[] = [];
  for (const factItem of facts) {
    const key = `${factItem.key}\u0000${JSON.stringify(factItem.value)}\u0000${factItem.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(factItem);
  }
  return deduped;
}

function dedupeRepresentationBindings(
  bindings: readonly NpcProfileRepresentationBinding[],
): readonly NpcProfileRepresentationBinding[] {
  const seen = new Set<string>();
  const deduped: NpcProfileRepresentationBinding[] = [];
  for (const binding of bindings) {
    const key = `${binding.role}\u0000${contentLocatorKey(binding.representation)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(binding);
  }
  return deduped;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function isNpcSerializableValue(value: unknown): value is NpcSerializableValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isNpcSerializableValue);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every(isNpcSerializableValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

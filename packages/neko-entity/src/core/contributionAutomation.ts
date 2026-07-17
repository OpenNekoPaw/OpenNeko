import type {
  CharacterObservation,
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityCandidateIdentityBasis,
  CreativeEntityCandidateProvenance,
  CreativeEntityKind,
  CreativeEntityRef,
  EntityMemoryContribution,
} from '@neko/shared';
import { isCreativeEntityKind } from '@neko/shared';
import { normalizeAliasList, stableIdPart } from './adapters';
import type { CreativeEntityService } from './CreativeEntityService';

export type EntityContributionAutomationMode =
  | 'match-only'
  | 'candidate'
  | 'confirm-source-approved';

export type EntityContributionAutomationDecisionKind =
  | 'matched-existing'
  | 'matched-candidate'
  | 'created-candidate'
  | 'confirmed-candidate'
  | 'skipped';

export interface EntityContributionAutomationOptions {
  readonly mode?: EntityContributionAutomationMode;
  readonly defaultKind?: CreativeEntityKind;
  readonly minimumCandidateConfidence?: number;
  readonly minimumAutoConfirmConfidence?: number;
}

export interface EntityContributionAutomationDecision {
  readonly kind: EntityContributionAutomationDecisionKind;
  readonly name?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly reason?: string;
}

export interface EntityContributionAutomationResult {
  readonly contributionId: string;
  readonly decisions: readonly EntityContributionAutomationDecision[];
}

interface CandidateSeed {
  readonly name: string;
  readonly kind: CreativeEntityKind;
  readonly aliases: readonly string[];
  readonly identityBasis: CreativeEntityCandidateIdentityBasis;
  readonly confidence?: number;
  readonly provenance: readonly CreativeEntityCandidateProvenance[];
  readonly sourceRefs: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export class EntityContributionAutomationService {
  constructor(private readonly service: CreativeEntityService) {}

  async processContribution(
    contribution: EntityMemoryContribution,
    options: EntityContributionAutomationOptions = {},
  ): Promise<EntityContributionAutomationResult> {
    const mode = options.mode ?? 'candidate';
    const seeds = collectCandidateSeeds(contribution, options);
    const decisions: EntityContributionAutomationDecision[] = [];

    for (const seed of seeds) {
      const decision = await this.processSeed(contribution, seed, mode, options);
      decisions.push(decision);
    }

    return {
      contributionId: contribution.contributionId,
      decisions,
    };
  }

  private async processSeed(
    contribution: EntityMemoryContribution,
    seed: CandidateSeed,
    mode: EntityContributionAutomationMode,
    options: EntityContributionAutomationOptions,
  ): Promise<EntityContributionAutomationDecision> {
    const existing = await this.resolveExistingEntity(seed);
    if (existing) {
      return {
        kind: 'matched-existing',
        name: seed.name,
        entityRef: entityRefFor(existing, this.service.store.projectRoot),
      };
    }

    if (mode === 'match-only') {
      return {
        kind: 'skipped',
        name: seed.name,
        reason: 'No existing entity matched and candidate creation is disabled.',
      };
    }

    const minimumCandidateConfidence = options.minimumCandidateConfidence ?? 0;
    if ((seed.confidence ?? 1) < minimumCandidateConfidence) {
      return {
        kind: 'skipped',
        name: seed.name,
        reason: `Candidate confidence is below ${minimumCandidateConfidence}.`,
      };
    }

    const matchedCandidate = await this.resolveOpenCandidate(seed);
    const candidate = await this.service.proposeCandidate({
      ...(matchedCandidate ? { id: matchedCandidate.id } : {}),
      kind: seed.kind,
      name: matchedCandidate?.name ?? seed.name,
      aliases: matchedCandidate ? aliasesForMatchedCandidate(seed, matchedCandidate) : seed.aliases,
      identityBasis: seed.identityBasis,
      confidence: seed.confidence,
      provenance: seed.provenance,
      sourceRefs: seed.sourceRefs,
      metadata: seed.metadata,
    });

    if (mode === 'confirm-source-approved' && contribution.reviewPolicy === 'source-approved') {
      const minimumAutoConfirmConfidence = options.minimumAutoConfirmConfidence ?? 0.95;
      if ((candidate.confidence ?? seed.confidence ?? 0) >= minimumAutoConfirmConfidence) {
        const confirmed = await this.service.confirmCandidate({ candidateId: candidate.id });
        return {
          kind: 'confirmed-candidate',
          name: seed.name,
          candidateId: candidate.id,
          entityRef: confirmed.affectedEntityRefs[0],
        };
      }
    }

    return {
      kind: matchedCandidate ? 'matched-candidate' : 'created-candidate',
      name: seed.name,
      candidateId: candidate.id,
      entityRef: candidate.resolvedEntityRef,
    };
  }

  private async resolveExistingEntity(seed: CandidateSeed): Promise<CreativeEntity | undefined> {
    const names = [seed.name, ...seed.aliases];
    for (const name of names) {
      const entity = await this.service.resolveByName(name, seed.kind);
      if (entity) return entity;
    }
    return undefined;
  }

  private async resolveOpenCandidate(
    seed: CandidateSeed,
  ): Promise<CreativeEntityCandidate | undefined> {
    const names = [seed.name, ...seed.aliases].map(normalizedName);
    const candidates = await this.service.listCandidates('open');
    return candidates.find((candidate) => {
      if (candidate.kind !== seed.kind) return false;
      if (candidate.identityBasis !== 'user-named') return false;
      const candidateNames = [candidate.name, ...(candidate.aliases ?? [])].map(normalizedName);
      return candidateNames.some((name) => names.includes(name));
    });
  }
}

function collectCandidateSeeds(
  contribution: EntityMemoryContribution,
  options: EntityContributionAutomationOptions,
): readonly CandidateSeed[] {
  const seeds = new Map<string, CandidateSeed>();

  for (const candidate of contribution.entityCandidates ?? []) {
    addSeed(seeds, seedFromCandidate(contribution, candidate, options));
  }

  for (const observation of contribution.characterObservations ?? []) {
    const seed = seedFromObservation(contribution, observation, options);
    if (seed) addSeed(seeds, seed);
  }

  return [...seeds.values()];
}

function seedFromCandidate(
  contribution: EntityMemoryContribution,
  candidate: CreativeEntityCandidate,
  options: EntityContributionAutomationOptions,
): CandidateSeed {
  return {
    name: candidate.name,
    kind: candidate.kind,
    aliases: candidate.aliases ?? [],
    identityBasis: candidate.identityBasis ?? 'user-named',
    confidence: candidate.confidence,
    provenance:
      candidate.provenance.length > 0
        ? candidate.provenance
        : [defaultProvenance(contribution, candidate.name, candidate.confidence)],
    sourceRefs:
      candidate.sourceRefs.length > 0
        ? candidate.sourceRefs
        : compactStrings([sourceRefLabel(contribution.sourceRef)]),
    metadata: {
      ...(candidate.metadata ?? {}),
      contributionId: contribution.contributionId,
      sourcePackage: contribution.sourcePackage,
      automationSource: 'entity-memory-contribution',
      defaultKind: options.defaultKind ?? 'character',
    },
  };
}

function seedFromObservation(
  contribution: EntityMemoryContribution,
  observation: CharacterObservation,
  options: EntityContributionAutomationOptions,
): CandidateSeed | undefined {
  if (observation.entityRef) return undefined;

  const mention = observation.mention;
  const name = firstNonEmpty([mention?.candidateName, mention?.text, observation.candidate?.name]);
  if (!name) return undefined;

  const candidateKind = observation.candidate?.kind ?? options.defaultKind ?? 'character';
  const kind = isCreativeEntityKind(candidateKind) ? candidateKind : 'character';
  const confidence = maxConfidence([
    observation.confidence,
    mention?.confidence,
    observation.candidate?.confidence,
  ]);
  const sourceRef = sourceRefLabel(observation.sourceRef) ?? sourceRefLabel(contribution.sourceRef);

  return {
    name,
    kind,
    aliases: [],
    identityBasis: readCandidateIdentityBasis(observation.candidate),
    confidence,
    provenance: [
      {
        providerId: observation.provenance.providerId ?? contribution.sourcePackage,
        sourceKind: 'agent',
        ...(sourceRef ? { sourceRef } : {}),
        label: `observation:${observation.observationId}`,
        ...(confidence !== undefined ? { confidence } : {}),
        ...(observation.provenance.observedAt
          ? { observedAt: observation.provenance.observedAt }
          : {}),
        metadata: {
          contributionId: contribution.contributionId,
          observationId: observation.observationId,
          reviewStatus: observation.reviewStatus,
        },
      },
    ],
    sourceRefs: compactStrings([sourceRef]),
    metadata: {
      contributionId: contribution.contributionId,
      sourcePackage: contribution.sourcePackage,
      observationIds: [observation.observationId],
      automationSource: 'character-observation',
    },
  };
}

function addSeed(seeds: Map<string, CandidateSeed>, seed: CandidateSeed): void {
  const key = `${seed.kind}\u0000${normalizedName(seed.name)}`;
  const existing = seeds.get(key);
  if (!existing) {
    seeds.set(key, seed);
    return;
  }

  seeds.set(key, {
    ...existing,
    aliases: normalizeAliasList([...existing.aliases, ...seed.aliases]),
    identityBasis:
      existing.identityBasis === seed.identityBasis ? existing.identityBasis : 'user-named',
    confidence: maxConfidence([existing.confidence, seed.confidence]),
    provenance: mergeProvenance(existing.provenance, seed.provenance),
    sourceRefs: uniqueStrings([...existing.sourceRefs, ...seed.sourceRefs]),
    metadata: {
      ...(existing.metadata ?? {}),
      ...(seed.metadata ?? {}),
      observationIds: uniqueStrings([
        ...readStringArray(existing.metadata?.['observationIds']),
        ...readStringArray(seed.metadata?.['observationIds']),
      ]),
    },
  });
}

function defaultProvenance(
  contribution: EntityMemoryContribution,
  label: string,
  confidence: number | undefined,
): CreativeEntityCandidateProvenance {
  return {
    providerId: contribution.sourcePackage,
    sourceKind: 'agent',
    ...(sourceRefLabel(contribution.sourceRef)
      ? { sourceRef: sourceRefLabel(contribution.sourceRef) }
      : {}),
    label,
    ...(confidence !== undefined ? { confidence } : {}),
    metadata: {
      contributionId: contribution.contributionId,
      reviewPolicy: contribution.reviewPolicy,
    },
  };
}

function entityRefFor(entity: CreativeEntity, projectRoot: string): CreativeEntityRef {
  return {
    entityId: entity.id,
    entityKind: entity.kind,
    projectRoot,
    source: 'neko-entity',
  };
}

function mergeProvenance(
  left: readonly CreativeEntityCandidateProvenance[],
  right: readonly CreativeEntityCandidateProvenance[],
): readonly CreativeEntityCandidateProvenance[] {
  const seen = new Set<string>();
  const merged: CreativeEntityCandidateProvenance[] = [];
  for (const item of [...left, ...right]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function aliasesForMatchedCandidate(
  seed: CandidateSeed,
  candidate: CreativeEntityCandidate,
): readonly string[] {
  const canonical = normalizedName(candidate.name);
  return normalizeAliasList([seed.name, ...seed.aliases]).filter(
    (alias) => normalizedName(alias) !== canonical,
  );
}

function sourceRefLabel(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function normalizedName(value: string): string {
  return stableIdPart(value).toLocaleLowerCase();
}

function firstNonEmpty(values: readonly (string | undefined)[]): string | undefined {
  return values
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
}

function maxConfidence(values: readonly (number | undefined)[]): number | undefined {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  return numbers.length > 0 ? Math.max(...numbers) : undefined;
}

function compactStrings(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readCandidateIdentityBasis(
  candidate: Pick<CreativeEntityCandidate, 'id' | 'name' | 'kind' | 'confidence'> | undefined,
): CreativeEntityCandidateIdentityBasis {
  if (!isRecord(candidate)) return 'user-named';
  const record: Record<string, unknown> = candidate;
  const value = record['identityBasis'];
  return value === 'placeholder' ||
    value === 'visual' ||
    value === 'asset' ||
    value === 'user-named'
    ? value
    : 'user-named';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type {
  ContentBytes,
  ContentIoDiagnostic,
  ContentLocator,
  ContentReadOptions,
  ContentReadService,
  ContentStat,
  CreativeEntityOperationResult,
  EntityRepresentationBinding,
  EntityRepresentationTarget,
  EntityRepresentationResolveRequest,
  EntityRepresentationResolveResult,
} from '@neko/shared';
import { contentLocatorKey, contentLocatorsEqual } from '@neko/shared';
import type { EntityRepresentationResolver } from './representationResolver';

type ResolvedEntityRepresentation = Extract<
  EntityRepresentationResolveResult,
  { status: 'resolved' }
>;

type MissingEntityRepresentation = Extract<
  EntityRepresentationResolveResult,
  { status: 'missing-representation' }
>;

export type EntityRepresentationStatResult =
  | {
      readonly status: 'resolved';
      readonly selection: ResolvedEntityRepresentation;
      readonly content: ContentStat;
    }
  | MissingEntityRepresentation;

export type EntityRepresentationReadResult =
  | {
      readonly status: 'resolved';
      readonly selection: ResolvedEntityRepresentation;
      readonly content: ContentBytes;
    }
  | MissingEntityRepresentation;

export interface EntityRepresentationAccessOptions {
  readonly resolver: EntityRepresentationResolver;
  readonly content: ContentReadService;
}

export class EntityRepresentationAccessService {
  constructor(private readonly options: EntityRepresentationAccessOptions) {}

  async stat(
    request: EntityRepresentationResolveRequest,
    options?: ContentReadOptions,
  ): Promise<EntityRepresentationStatResult> {
    const selection = await this.options.resolver.resolve(request);
    if (selection.status === 'missing-representation') return selection;
    return {
      status: 'resolved',
      selection,
      content: await this.options.content.stat(selection.representation, options),
    };
  }

  async read(
    request: EntityRepresentationResolveRequest,
    options?: ContentReadOptions,
  ): Promise<EntityRepresentationReadResult> {
    const selection = await this.options.resolver.resolve(request);
    if (selection.status === 'missing-representation') return selection;
    return {
      status: 'resolved',
      selection,
      content: await this.options.content.read(selection.representation, options),
    };
  }
}

export interface EntityRepresentationRebindOptions {
  readonly bindings: { list(): Promise<readonly EntityRepresentationBinding[]> };
  readonly content: ContentReadService;
  readonly commit: (input: {
    readonly bindingId: string;
    readonly representation: EntityRepresentationTarget;
  }) => Promise<CreativeEntityOperationResult>;
}

export type EntityRepresentationRebindResult =
  | {
      readonly status: 'rebound';
      readonly bindingId: string;
      readonly representation: EntityRepresentationTarget;
      readonly operation: CreativeEntityOperationResult;
    }
  | {
      readonly status: 'unavailable';
      readonly bindingId: string;
      readonly representation: EntityRepresentationTarget;
      readonly diagnostic: ContentIoDiagnostic;
    };

export interface EntityRepresentationRebindCandidate {
  readonly representation: EntityRepresentationTarget;
  readonly evidence: readonly ('fingerprint' | 'name')[];
  readonly confidence: number;
}

export class EntityRepresentationRebindService {
  constructor(private readonly options: EntityRepresentationRebindOptions) {}

  async rebind(
    bindingId: string,
    representation: EntityRepresentationTarget,
  ): Promise<EntityRepresentationRebindResult> {
    const binding = (await this.options.bindings.list()).find(
      (candidate) => candidate.id === bindingId,
    );
    if (!binding) throw new Error(`Entity representation binding not found: ${bindingId}`);
    if (binding.availability !== 'orphaned') {
      throw new Error(`Entity representation binding is not orphaned: ${bindingId}`);
    }

    const stat = await this.options.content.stat(representation);
    if (stat.status === 'unavailable') {
      return {
        status: 'unavailable',
        bindingId,
        representation,
        diagnostic: stat.diagnostic,
      };
    }
    const verifiedRepresentation = withVerifiedFingerprint(representation, stat.fingerprint);
    return {
      status: 'rebound',
      bindingId,
      representation: verifiedRepresentation,
      operation: await this.options.commit({ bindingId, representation: verifiedRepresentation }),
    };
  }
}

export function suggestEntityRepresentationRebindCandidates(
  binding: EntityRepresentationBinding,
  candidates: readonly EntityRepresentationTarget[],
): readonly EntityRepresentationRebindCandidate[] {
  const sourceFingerprint = representationFingerprint(binding.representation);
  const sourceName = representationName(binding.representation);
  const seen = new Set<string>();
  const suggestions: EntityRepresentationRebindCandidate[] = [];
  for (const representation of candidates) {
    if (contentLocatorsEqual(binding.representation, representation)) continue;
    const key = contentLocatorKey(representation);
    if (seen.has(key)) continue;
    seen.add(key);
    const evidence: Array<'fingerprint' | 'name'> = [];
    const candidateFingerprint = representationFingerprint(representation);
    if (
      sourceFingerprint &&
      candidateFingerprint &&
      sourceFingerprint.strategy === candidateFingerprint.strategy &&
      sourceFingerprint.value === candidateFingerprint.value
    ) {
      evidence.push('fingerprint');
    }
    if (sourceName && sourceName === representationName(representation)) evidence.push('name');
    if (evidence.length === 0) continue;
    suggestions.push({
      representation,
      evidence,
      confidence: evidence.includes('fingerprint') ? 1 : 0.5,
    });
  }
  return suggestions.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      contentLocatorKey(left.representation).localeCompare(contentLocatorKey(right.representation)),
  );
}

function withVerifiedFingerprint(
  representation: EntityRepresentationTarget,
  fingerprint: import('@neko/shared').ContentFingerprint,
): EntityRepresentationTarget {
  switch (representation.kind) {
    case 'workspace-file':
      return { ...representation, fingerprint };
    case 'document-entry':
      return { ...representation, fingerprint };
    case 'generated-output':
    case 'package-resource':
      return representation;
  }
}

function representationFingerprint(
  representation: ContentLocator,
): import('@neko/shared').ContentFingerprint | undefined {
  switch (representation.kind) {
    case 'workspace-file':
      return representation.fingerprint;
    case 'document-entry':
      return representation.fingerprint ?? representation.source.fingerprint;
    case 'generated-output':
      return { strategy: 'sha256', value: representation.digest };
    case 'package-resource':
      return representation.digest
        ? { strategy: 'sha256', value: representation.digest }
        : undefined;
  }
}

function representationName(representation: ContentLocator): string | undefined {
  const locatorPath =
    representation.kind === 'workspace-file'
      ? representation.path
      : representation.kind === 'document-entry'
        ? representation.entryPath
        : representation.kind === 'generated-output'
          ? representation.path
          : representation.resourcePath;
  return locatorPath.split('/').pop()?.normalize('NFC').toLocaleLowerCase();
}

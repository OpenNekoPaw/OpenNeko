import type {
  CreativeEntityCandidate,
  CreativeEntityOccurrenceProjection,
  CreativeEntityProviderStatus,
  CreativeEntityRelationshipProjection,
  CreativeEntityRepresentationHint,
  CreativeEntitySyncSuggestion,
} from '@neko/shared';

export * from './story';

export interface CreativeEntityProviderContext {
  readonly projectRoot: string;
  readonly changedRefs?: readonly string[];
}

export interface CreativeEntityProvider {
  readonly providerId: string;
  getStatus(context: CreativeEntityProviderContext): Promise<CreativeEntityProviderStatus>;
  listCandidates?(
    context: CreativeEntityProviderContext,
  ): Promise<readonly CreativeEntityCandidate[]>;
  listOccurrences?(
    context: CreativeEntityProviderContext,
  ): Promise<readonly CreativeEntityOccurrenceProjection[]>;
  listRelationships?(
    context: CreativeEntityProviderContext,
  ): Promise<readonly CreativeEntityRelationshipProjection[]>;
  listRepresentationHints?(
    context: CreativeEntityProviderContext,
  ): Promise<readonly CreativeEntityRepresentationHint[]>;
  listSyncSuggestions?(
    context: CreativeEntityProviderContext,
  ): Promise<readonly CreativeEntitySyncSuggestion[]>;
}

export interface CreativeEntityProviderSnapshot {
  readonly statuses: readonly CreativeEntityProviderStatus[];
  readonly candidates: readonly CreativeEntityCandidate[];
  readonly occurrences: readonly CreativeEntityOccurrenceProjection[];
  readonly relationships: readonly CreativeEntityRelationshipProjection[];
  readonly representationHints: readonly CreativeEntityRepresentationHint[];
  readonly syncSuggestions: readonly CreativeEntitySyncSuggestion[];
}

export class CreativeEntityProviderRegistry {
  private readonly providers = new Map<string, CreativeEntityProvider>();

  register(provider: CreativeEntityProvider): { dispose(): void } {
    this.providers.set(provider.providerId, provider);
    return {
      dispose: () => {
        if (this.providers.get(provider.providerId) === provider) {
          this.providers.delete(provider.providerId);
        }
      },
    };
  }

  list(): readonly CreativeEntityProvider[] {
    return [...this.providers.values()].sort((a, b) => a.providerId.localeCompare(b.providerId));
  }

  async collect(context: CreativeEntityProviderContext): Promise<CreativeEntityProviderSnapshot> {
    const statuses: CreativeEntityProviderStatus[] = [];
    const candidates: CreativeEntityCandidate[] = [];
    const occurrences: CreativeEntityOccurrenceProjection[] = [];
    const relationships: CreativeEntityRelationshipProjection[] = [];
    const representationHints: CreativeEntityRepresentationHint[] = [];
    const syncSuggestions: CreativeEntitySyncSuggestion[] = [];

    for (const provider of this.list()) {
      try {
        statuses.push(await provider.getStatus(context));
        candidates.push(...((await provider.listCandidates?.(context)) ?? []));
        occurrences.push(...((await provider.listOccurrences?.(context)) ?? []));
        relationships.push(...((await provider.listRelationships?.(context)) ?? []));
        representationHints.push(...((await provider.listRepresentationHints?.(context)) ?? []));
        syncSuggestions.push(...((await provider.listSyncSuggestions?.(context)) ?? []));
      } catch (error) {
        statuses.push({
          providerId: provider.providerId,
          sourceKind: 'importer',
          available: false,
          freshness: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      statuses,
      candidates: dedupeById(candidates),
      occurrences: dedupeByKey(occurrences, occurrenceKey),
      relationships: dedupeByKey(relationships, relationshipKey),
      representationHints: dedupeByKey(representationHints, hintKey),
      syncSuggestions: dedupeById(syncSuggestions),
    };
  }
}

function dedupeById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return dedupeByKey(items, (item) => item.id);
}

function dedupeByKey<T>(items: readonly T[], keyOf: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function occurrenceKey(item: CreativeEntityOccurrenceProjection): string {
  return `${item.entityRef?.entityId ?? item.candidateId ?? ''}:${item.source.sourceId}:${item.location}:${item.role}`;
}

function relationshipKey(item: CreativeEntityRelationshipProjection): string {
  return `${item.from.entityId}:${item.to.entityId}:${item.type}:${item.source.sourceId}`;
}

function hintKey(item: CreativeEntityRepresentationHint): string {
  return `${item.entityRef?.entityId ?? item.candidateId ?? ''}:${item.assetRef}:${item.roles.join(',')}:${item.source.sourceId}`;
}

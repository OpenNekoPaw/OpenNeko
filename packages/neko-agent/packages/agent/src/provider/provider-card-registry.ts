import type {
  IProviderCardRegistry,
  ProviderCard,
  ProviderCardFilter,
  ProviderCardLayer,
  ProviderGenerationCapability,
  ProviderId,
  ProviderModelId,
} from '@neko/shared';
import { isValidProviderId } from '@neko/shared';

const LAYER_ORDER: readonly ProviderCardLayer[] = ['builtin', 'personal', 'project'];

export class ProviderCardRegistry implements IProviderCardRegistry {
  private readonly _cardsByTarget = new Map<string, Map<ProviderCardLayer, ProviderCard>>();

  register(card: ProviderCard): void {
    assertProviderId(card.providerId);
    const key = toProviderCardKey(card.providerId, card.modelId);
    const layers = this._cardsByTarget.get(key) ?? new Map<ProviderCardLayer, ProviderCard>();
    layers.set(card.sourceLayer, card);
    this._cardsByTarget.set(key, layers);
  }

  unregister(
    providerId: ProviderId,
    sourceLayer?: ProviderCardLayer,
    modelId?: ProviderModelId,
  ): void {
    assertProviderId(providerId);
    const key = toProviderCardKey(providerId, modelId);
    if (!sourceLayer) {
      this._cardsByTarget.delete(key);
      return;
    }

    const layers = this._cardsByTarget.get(key);
    if (!layers) return;
    layers.delete(sourceLayer);
    if (layers.size === 0) {
      this._cardsByTarget.delete(key);
    }
  }

  get(providerId: ProviderId, modelId?: ProviderModelId): ProviderCard | undefined {
    assertProviderId(providerId);
    const layers = this._cardsByTarget.get(toProviderCardKey(providerId, modelId));
    return layers ? mergeProviderCards(Array.from(layers.values())) : undefined;
  }

  list(filter: ProviderCardFilter = {}): readonly ProviderCard[] {
    return Array.from(this._cardsByTarget.values())
      .map((layers) => mergeProviderCards(Array.from(layers.values())))
      .filter((card) => matchesFilter(card, filter))
      .sort((left, right) => compareProviderCards(left, right));
  }

  forCapability(capability: ProviderGenerationCapability): readonly ProviderCard[] {
    return this.list({ capability });
  }
}

export function createProviderCardRegistry(
  cards: readonly ProviderCard[] = [],
): ProviderCardRegistry {
  const registry = new ProviderCardRegistry();
  for (const card of cards) {
    registry.register(card);
  }
  return registry;
}

function matchesFilter(card: ProviderCard, filter: ProviderCardFilter): boolean {
  if (filter.providerId && card.providerId !== filter.providerId) return false;
  if (filter.modelId && card.modelId !== filter.modelId) return false;
  if (filter.capability && !card.capabilities.includes(filter.capability)) return false;
  if (filter.sourceLayer && card.sourceLayer !== filter.sourceLayer) return false;
  if (filter.styleFamily) {
    return (card.trainingProfile.styleAffinities[filter.styleFamily] ?? 0) > 0;
  }
  return true;
}

function mergeProviderCards(cards: readonly ProviderCard[]): ProviderCard {
  const sorted = [...cards].sort(
    (left, right) => LAYER_ORDER.indexOf(left.sourceLayer) - LAYER_ORDER.indexOf(right.sourceLayer),
  );
  const base = sorted[0];
  if (!base) {
    throw new Error('Cannot merge empty provider card list');
  }

  return sorted.slice(1).reduce(
    (current, next) => ({
      ...current,
      ...next,
      capabilities: mergeArray(current.capabilities, next.capabilities),
      inputModalities: mergeInputModalities(current.inputModalities, next.inputModalities),
      syntaxProfile: {
        ...current.syntaxProfile,
        ...next.syntaxProfile,
        notes: mergeArray(current.syntaxProfile.notes, next.syntaxProfile.notes),
      },
      conceptCoverage: {
        entries: mergeConceptEntries(current.conceptCoverage.entries, next.conceptCoverage.entries),
      },
      trainingProfile: {
        ...current.trainingProfile,
        ...next.trainingProfile,
        styleAffinities: {
          ...current.trainingProfile.styleAffinities,
          ...next.trainingProfile.styleAffinities,
        },
        antiBiasStrategies: mergeArray(
          current.trainingProfile.antiBiasStrategies,
          next.trainingProfile.antiBiasStrategies,
        ),
      },
      sourceLayer: next.sourceLayer,
    }),
    base,
  );
}

function mergeArray<T>(left: readonly T[], right: readonly T[]): readonly T[] {
  return Array.from(new Set([...left, ...right]));
}

function mergeInputModalities(
  left: ProviderCard['inputModalities'],
  right: ProviderCard['inputModalities'],
): ProviderCard['inputModalities'] {
  if (!left) return right;
  if (!right) return left;
  return { ...left, ...right };
}

function mergeConceptEntries(
  left: ProviderCard['conceptCoverage']['entries'],
  right: ProviderCard['conceptCoverage']['entries'],
): ProviderCard['conceptCoverage']['entries'] {
  const entries = new Map<string, ProviderCard['conceptCoverage']['entries'][number]>();
  for (const entry of left) entries.set(entry.concept.toLowerCase(), entry);
  for (const entry of right) entries.set(entry.concept.toLowerCase(), entry);
  return Array.from(entries.values());
}

function toProviderCardKey(providerId: ProviderId, modelId: ProviderModelId | undefined): string {
  return modelId ? `${providerId}\u0000${modelId}` : providerId;
}

function compareProviderCards(left: ProviderCard, right: ProviderCard): number {
  return (
    left.providerId.localeCompare(right.providerId) ||
    (left.modelId ?? '').localeCompare(right.modelId ?? '')
  );
}

function assertProviderId(providerId: ProviderId): void {
  if (!isValidProviderId(providerId)) {
    throw new Error(`Invalid providerId: ${providerId}`);
  }
}

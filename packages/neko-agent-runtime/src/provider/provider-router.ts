import type {
  IProviderRouter,
  IProviderCardRegistry,
  ProviderCard,
  ProviderRouteInput,
  ProviderTarget,
  ProviderSelection,
} from '@neko/shared';

interface ScoredProvider {
  readonly card: ProviderCard;
  readonly score: number;
  readonly reasons: readonly string[];
}

/**
 * Selects a provider from ProviderCards only.
 *
 * ProviderRouter must not rewrite prompts or interpret ProviderCard concept
 * entries as replacement rules. Expression adaptation happens in the AGENT via
 * ProviderExpressionContext prompt fragments.
 */
export class ProviderRouter implements IProviderRouter {
  constructor(private readonly _registry: IProviderCardRegistry) {}

  route(input: ProviderRouteInput): ProviderSelection {
    const disabled = new Set(input.userPreference?.disabledProviders ?? []);
    const candidates = this._registry
      .forCapability(input.capability)
      .filter((card) => !disabled.has(card.providerId))
      .filter((card) => !input.providerId || card.providerId === input.providerId)
      .filter((card) => !input.modelId || card.modelId === input.modelId)
      .map((card) => scoreProvider(card, input))
      .sort(
        (left, right) =>
          right.score - left.score || left.card.providerId.localeCompare(right.card.providerId),
      );

    const primary = candidates[0];
    if (!primary) {
      throw new Error(`No provider card registered for capability: ${input.capability}`);
    }

    const fallbacks =
      input.fallbackChain === false
        ? []
        : candidates.slice(1).map((entry) => toProviderTarget(entry.card));
    return {
      primary: primary.card.providerId,
      ...(primary.card.modelId ? { modelId: primary.card.modelId } : {}),
      fallbacks,
      reason: formatReason(primary, input),
    };
  }
}

export function createProviderRouter(registry: IProviderCardRegistry): ProviderRouter {
  return new ProviderRouter(registry);
}

function scoreProvider(card: ProviderCard, input: ProviderRouteInput): ScoredProvider {
  let score = card.trainingProfile.styleAffinities[input.styleFamily] ?? 0;
  const reasons = [`style ${input.styleFamily}: ${score}`];

  if (input.userPreference?.preferredProvider === card.providerId) {
    score += 2;
    reasons.push('user preferred +2');
  }
  if (input.projectHints?.preferredProviders?.includes(card.providerId)) {
    score += 1;
    reasons.push('project preferred +1');
  }
  if (input.projectHints?.preferredTargets?.some((target) => isSameProviderTarget(card, target))) {
    score += 2;
    reasons.push('project target preferred +2');
  }
  if (input.projectHints?.avoidedProviders?.includes(card.providerId)) {
    score -= 2;
    reasons.push('project avoided -2');
  }
  if (input.projectHints?.avoidedTargets?.some((target) => isSameProviderTarget(card, target))) {
    score -= 3;
    reasons.push('project target avoided -3');
  }

  const targetSuccessRate = input.projectHints?.targetSuccessRate?.[toProviderTargetKey(card)];
  const successRate =
    targetSuccessRate ?? input.projectHints?.providerSuccessRate?.[card.providerId];
  if (successRate !== undefined) {
    const weighted = Math.max(-1, Math.min(1, successRate - 0.5));
    score += weighted;
    reasons.push(
      `success rate ${successRate.toFixed(2)} ${weighted >= 0 ? '+' : ''}${weighted.toFixed(2)}`,
    );
  }

  return { card, score, reasons };
}

function formatReason(scored: ScoredProvider, input: ProviderRouteInput): string {
  const fallbacksHint = input.fallbackChain === false ? 'fallbacks disabled' : 'fallbacks enabled';
  const target = scored.card.modelId
    ? `${scored.card.providerId}/${scored.card.modelId}`
    : scored.card.providerId;
  return `Selected ${target} for ${input.capability}/${input.styleFamily}; score ${scored.score.toFixed(2)} (${scored.reasons.join(', ')}; ${fallbacksHint}).`;
}

function toProviderTarget(card: {
  readonly providerId: string;
  readonly modelId?: string;
}): ProviderTarget {
  return {
    providerId: card.providerId,
    ...(card.modelId ? { modelId: card.modelId } : {}),
  };
}

function isSameProviderTarget(
  card: { readonly providerId: string; readonly modelId?: string },
  target: ProviderTarget,
): boolean {
  return card.providerId === target.providerId && card.modelId === target.modelId;
}

function toProviderTargetKey(target: {
  readonly providerId: string;
  readonly modelId?: string;
}): string {
  return target.modelId ? `${target.providerId}/${target.modelId}` : target.providerId;
}

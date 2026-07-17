/** Active/protected trees are additional to this bounded clean-history budget. */
const DEFAULT_MAX_RETAINED_CLEAN_INACTIVE_TABS = 4;

export interface TabComponentRetentionCandidate {
  readonly tabId: string;
  readonly active: boolean;
  readonly mustRetain: boolean;
}

export interface TabComponentRetentionPolicy {
  reconcile(candidates: readonly TabComponentRetentionCandidate[]): ReadonlySet<string>;
}

export function createTabComponentRetentionPolicy(
  maxRetainedCleanInactiveTabs = DEFAULT_MAX_RETAINED_CLEAN_INACTIVE_TABS,
): TabComponentRetentionPolicy {
  return new DefaultTabComponentRetentionPolicy(maxRetainedCleanInactiveTabs);
}

class DefaultTabComponentRetentionPolicy implements TabComponentRetentionPolicy {
  private readonly activationOrder = new Map<string, number>();
  private sequence = 0;
  private activeTabId: string | null = null;

  constructor(private readonly maxRetainedCleanInactiveTabs: number) {
    if (!Number.isInteger(maxRetainedCleanInactiveTabs) || maxRetainedCleanInactiveTabs < 0) {
      throw new Error('Tab component retention limit must be a non-negative integer.');
    }
  }

  reconcile(candidates: readonly TabComponentRetentionCandidate[]): ReadonlySet<string> {
    const candidateIds = new Set<string>();
    let nextActiveTabId: string | null = null;

    for (const candidate of candidates) {
      if (candidateIds.has(candidate.tabId)) {
        throw new Error(`Duplicate Tab component retention candidate ${candidate.tabId}.`);
      }
      candidateIds.add(candidate.tabId);
      if (!this.activationOrder.has(candidate.tabId)) {
        this.activationOrder.set(candidate.tabId, ++this.sequence);
      }
      if (candidate.active) {
        if (nextActiveTabId !== null) {
          throw new Error(
            `Multiple active Tab component retention candidates: ${nextActiveTabId}, ${candidate.tabId}.`,
          );
        }
        nextActiveTabId = candidate.tabId;
      }
    }

    for (const tabId of this.activationOrder.keys()) {
      if (!candidateIds.has(tabId)) this.activationOrder.delete(tabId);
    }

    if (nextActiveTabId !== null && nextActiveTabId !== this.activeTabId) {
      this.activationOrder.set(nextActiveTabId, ++this.sequence);
    }
    this.activeTabId = nextActiveTabId;

    const retained = new Set<string>();
    const cleanInactive: TabComponentRetentionCandidate[] = [];
    for (const candidate of candidates) {
      if (candidate.active || candidate.mustRetain) retained.add(candidate.tabId);
      else cleanInactive.push(candidate);
    }

    cleanInactive
      .sort(
        (left, right) =>
          (this.activationOrder.get(right.tabId) ?? 0) -
          (this.activationOrder.get(left.tabId) ?? 0),
      )
      .slice(0, this.maxRetainedCleanInactiveTabs)
      .forEach((candidate) => retained.add(candidate.tabId));

    return retained;
  }
}

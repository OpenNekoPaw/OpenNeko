/**
 * Preferences strategy pack — user-governance approval rules (ADR §9.3).
 *
 * Wraps a `UserPreferences` snapshot parsed from `preferences.md` and
 * exposes two StrategyPack instances (one per paradigm) that run
 * BEFORE the default creation / execution packs. This lets preferences
 * short-circuit the decision tree.
 *
 * Escalation and acceptance semantics (ADR §9.4 "可加强但不可降级"):
 *   - `alwaysApprove` match → return `escalate` (bypass default auto-accept
 *     and send to user prompt). Fires even for subjects default packs
 *     would have auto-accepted.
 *   - `autoApprove` match → return `auto-accept` IFF the subject is not
 *     destructive. Destructive subjects never auto-accept via preferences
 *     (L0 critical gate cannot be downgraded).
 *   - Cost threshold breach → return `escalate` with reason identifying
 *     which axis tripped.
 *   - No match → return undefined (defer to next pack).
 *
 * Preferences are NOT stored inside the engine; the pack holds a
 * reference and re-reads on each evaluate(). Callers swap preferences
 * (e.g. on a hot reload) by building a new pack.
 */

import type {
  ApprovalRequest,
  ApprovalResponse,
  StrategyPack,
  ApprovalSubject,
} from '../approval-types';
import type {
  UserPreferences,
  PreferenceSubjectRule,
  PreferenceCostThresholds,
} from '@neko-agent/types';

// =============================================================================
// Factory
// =============================================================================

/**
 * Build a dual-paradigm pair of strategy packs bound to this
 * preferences snapshot. Register both on the engine; the insertion
 * order must place them BEFORE the built-in creation / execution
 * packs so preferences wins when both could decide.
 */
export function createPreferencesStrategyPacks(
  preferences: UserPreferences,
): readonly StrategyPack[] {
  const evaluate = _buildEvaluator(preferences);
  return [
    { name: 'preferences-creation', scope: 'declarative', evaluate },
    { name: 'preferences-execution', scope: 'imperative', evaluate },
  ];
}

// =============================================================================
// Evaluator
// =============================================================================

function _buildEvaluator(
  preferences: UserPreferences,
): (request: ApprovalRequest) => ApprovalResponse | undefined {
  return (request) => {
    // 1. alwaysApprove — forced escalation, highest priority.
    const alwaysMatch = _matchRule(preferences.alwaysApprove, request);
    if (alwaysMatch) {
      return {
        requestId: request.id,
        resolution: 'escalate',
        reason: 'preferences-always-approve',
        note: `Matched rule: ${alwaysMatch.source}`,
        decidedAt: 0,
      };
    }

    // 2. Cost threshold breach — escalation.
    const breach = _checkThresholds(preferences.costThresholds, request);
    if (breach) {
      return {
        requestId: request.id,
        resolution: 'escalate',
        reason: 'preferences-cost-threshold',
        note: breach,
        decidedAt: 0,
      };
    }

    // 3. autoApprove — acceptance, but only for non-destructive subjects.
    //    Preferences cannot downgrade L0 critical gates (ADR §9.4).
    const autoMatch = _matchRule(preferences.autoApprove, request);
    if (autoMatch && !request.subject.destructive) {
      return {
        requestId: request.id,
        resolution: 'auto-accept',
        reason: 'preferences-auto-approve',
        note: `Matched rule: ${autoMatch.source}`,
        decidedAt: 0,
      };
    }

    // 4. No preferences rule applied; defer to the next pack.
    return undefined;
  };
}

// =============================================================================
// Matchers
// =============================================================================

function _matchRule(
  rules: readonly PreferenceSubjectRule[],
  request: ApprovalRequest,
): PreferenceSubjectRule | null {
  for (const rule of rules) {
    if (_matches(rule, request)) return rule;
  }
  return null;
}

function _matches(rule: PreferenceSubjectRule, request: ApprovalRequest): boolean {
  switch (rule.kind) {
    case 'any':
      return true;
    case 'tool':
      return _toolName(request.subject) === rule.value;
    case 'domain':
      return _domain(request) === rule.value;
    case 'channel':
      return request.channel === rule.value;
    case 'label':
      return request.subject.label.toLowerCase().includes(rule.value.toLowerCase());
  }
}

function _toolName(subject: ApprovalSubject): string | null {
  const k = subject.kind;
  if (k.startsWith('tool:')) return k.slice('tool:'.length);
  return null;
}

function _domain(request: ApprovalRequest): string | null {
  const ctx = request.context;
  if (!ctx) return null;
  const domain = ctx['domain'];
  return typeof domain === 'string' ? domain : null;
}

// =============================================================================
// Cost thresholds
// =============================================================================

function _checkThresholds(
  thresholds: PreferenceCostThresholds,
  request: ApprovalRequest,
): string | null {
  if (!request.context) return null;
  const ctx = request.context;

  if (thresholds.maxTokens !== undefined) {
    const tokens = _numeric(ctx['tokens']);
    if (tokens !== null && tokens > thresholds.maxTokens) {
      return `tokens ${tokens} > ${thresholds.maxTokens}`;
    }
  }
  if (thresholds.maxUsd !== undefined) {
    const usd = _numeric(ctx['usd']);
    if (usd !== null && usd > thresholds.maxUsd) {
      return `usd ${usd} > ${thresholds.maxUsd}`;
    }
  }
  if (thresholds.maxDurationMs !== undefined) {
    const duration = _numeric(ctx['durationMs']);
    if (duration !== null && duration > thresholds.maxDurationMs) {
      return `durationMs ${duration} > ${thresholds.maxDurationMs}`;
    }
  }
  return null;
}

function _numeric(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  return null;
}

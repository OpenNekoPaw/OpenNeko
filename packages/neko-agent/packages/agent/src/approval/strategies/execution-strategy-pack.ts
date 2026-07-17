/**
 * Execution strategy pack — approval rules for imperative-paradigm subjects
 * (ordinary Tool operations and technical decisions).
 *
 * Maps to ADR §6.1 "ExecutionStrategyPack: Operation authorization (by
 * costProfile)". The pack operates on `paradigm: 'imperative'` subjects —
 * i.e. tool calls and quality-gate verdicts in the current Agent turn.
 *
 * See: docs/architecture/agent-unified-workflow.md §6.1 (ApprovalEngine)
 *      §4.2 (declarative vs imperative split)
 *
 * Default posture:
 *   - permission: auto-accept idempotent non-destructive tools,
 *     ask user on destructive, auto-reject when both `destructive`
 *     and `idempotent === false` (we can't recover from a bad apply).
 *   - quality-gate: auto-accept when context carries a 'pass' verdict,
 *     escalate on 'warn', auto-reject on 'fail'.
 *   - creator-review: not our scope (creation pack owns it).
 */

import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

export const executionStrategyPack: StrategyPack = {
  name: 'execution-default',
  scope: 'imperative',
  evaluate(request: ApprovalRequest): ApprovalResponse | undefined {
    const { subject, channel, context } = request;

    if (channel === 'permission') {
      if (!subject.destructive && subject.idempotent !== false) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'idempotent-non-destructive',
          decidedAt: 0,
        };
      }
      if (subject.destructive && subject.idempotent === false) {
        return {
          requestId: request.id,
          resolution: 'auto-reject',
          reason: 'destructive-and-non-idempotent',
          note: 'Cannot safely run a destructive + non-idempotent tool without user confirmation.',
          decidedAt: 0,
        };
      }
      return undefined; // ask user
    }

    if (channel === 'quality-gate') {
      const verdict = typeof context?.verdict === 'string' ? context.verdict : undefined;
      if (verdict === 'pass') {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'quality-pass',
          decidedAt: 0,
        };
      }
      if (verdict === 'fail') {
        return {
          requestId: request.id,
          resolution: 'auto-reject',
          reason: 'quality-fail',
          decidedAt: 0,
        };
      }
      // 'warn' → escalate
      return {
        requestId: request.id,
        resolution: 'escalate',
        reason: 'quality-warn',
        decidedAt: 0,
      };
    }

    // Draft review not handled here.
    return undefined;
  },
};

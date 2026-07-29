/**
 * Creation strategy pack — approval rules for declarative-paradigm subjects
 * (creator-review documents and upstream creative decisions).
 *
 * Maps to ADR §6.1 "CreationStrategyPack: creator review decisions". The
 * pack operates on `paradigm: 'declarative'` subjects — creator reviews
 * and read-only probing done before an authorized mutation.
 *
 * See: docs/architecture/agent-unified-workflow.md §6.1 (ApprovalEngine)
 *      §4.2 (declarative vs imperative split)
 *
 * Default posture:
 *   - creator-review: always user-driven; callers may provide current content
 *     identity in generic request context for presentation and audit.
 *   - permission (read-only probing before mutation — typically
 *     read-only probing): allowed if non-destructive; ask user otherwise.
 *   - quality-gate: never auto-decides here; caller routes to the
 *     execution strategy pack.
 *
 * These are defaults — sites can swap via createApprovalEngine({ strategyPacks }).
 */

import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

export const creationStrategyPack: StrategyPack = {
  name: 'creation-default',
  scope: 'declarative',
  evaluate(request: ApprovalRequest): ApprovalResponse | undefined {
    const { subject, channel } = request;

    if (channel === 'creator-review') {
      return undefined;
    }

    if (channel === 'permission') {
      if (!subject.destructive) {
        return {
          requestId: request.id,
          resolution: 'auto-accept',
          reason: 'non-destructive-read',
          decidedAt: 0,
        };
      }
      return undefined;
    }

    // Quality gate is a technical-layer decision — not our scope.
    return undefined;
  },
};

/**
 * Approval Types — unified request/response shape for the three channels.
 *
 * See: docs/architecture/agent-unified-workflow.md §9 (approval governance)
 *
 * Three channels funnel through ApprovalEngine:
 *   - permission: operation-level authorization
 *   - creator-review: creator approval for reviewable decisions or documents
 *   - quality-gate: evidence-backed quality verdict
 *
 * Each has its own UI surface, but all three boil down to the same
 * core: "given a candidate action, decide accept / reject / escalate,
 * with optional reason and autoheal hint."
 *
 * Requests carry a `paradigm` field (declarative vs imperative) so strategy
 * packs can route decisions without inspecting channel strings.
 */

import type { AgentTraceContext } from '@neko/shared';
export type ApprovalParadigm = 'declarative' | 'imperative';

// =============================================================================
// Request kinds
// =============================================================================

export type ApprovalChannel =
  /** Operation authorization (fine-grained and frequent). */
  | 'permission'
  /** Creator review of decisions or a reviewable document digest. */
  | 'creator-review'
  /** Quality gate verdict. */
  | 'quality-gate';

/** Subject being approved — descriptive, not the full payload. */
export interface ApprovalSubject {
  /** Short identifier the UI will render in headers. */
  label: string;
  /**
   * Stable kind string that strategy packs route on — e.g.
   * 'tool:GenerateImage', 'plan:Plan-123', 'policy:consistency'.
   */
  kind: string;
  /** Is the action destructive? Strategy packs inspect this. */
  destructive?: boolean;
  /**
   * Does repeating the same action produce the same result? Informs
   * recovery guidance and retry policies.
   */
  idempotent?: boolean;
}

export interface ApprovalRequest {
  channel: ApprovalChannel;
  /**
   * Declarative creator decisions and imperative operations may use different
   * strategy packs without introducing a separate workflow runtime.
   */
  paradigm: ApprovalParadigm;
  subject: ApprovalSubject;
  /**
   * Structured context the strategy pack inspects — e.g. tool args,
   * current creator-review document identity/digest, or a quality report.
   * Opaque shape keeps the engine type-stable and prevents creative-domain
   * policy from leaking into the generic approval contract.
   */
  context?: Record<string, unknown>;
  /** Unique id so call sites can correlate responses with requests. */
  id: string;
  /** ms epoch. */
  at: number;
  /** Runtime trace context for structured debug logs. */
  trace?: AgentTraceContext;
}

// =============================================================================
// Decision + response
// =============================================================================

export type ApprovalResolution =
  /** Strategy pack auto-decided (no user ask). */
  | 'auto-accept'
  | 'auto-reject'
  /** User decided through their preferred UI. */
  | 'user-accept'
  | 'user-reject'
  /** Neither: escalate to a higher-authority handler. */
  | 'escalate';

export interface ApprovalResponse {
  requestId: string;
  resolution: ApprovalResolution;
  /** Short machine-readable reason (strategy pack key or UI verb). */
  reason: string;
  /** Human-readable detail for logs/UI. */
  note?: string;
  /** ms epoch — when the decision was made. */
  decidedAt: number;
}

// =============================================================================
// Strategy contract
// =============================================================================

/**
 * A strategy pack is called *before* the UI — it may short-circuit the
 * request (auto-accept / auto-reject) or return `undefined` meaning
 * "ask the user".
 */
export type ApprovalStrategy = (request: ApprovalRequest) => ApprovalResponse | undefined;

export interface StrategyPack {
  /** Label for telemetry. */
  name: string;
  /**
   * Which paradigm this pack handles. ApprovalEngine picks the pack by
   * request.paradigm; if both paradigm-specific packs decline, a 'shared'
   * pack may run last.
   */
  scope: ApprovalParadigm | 'shared';
  /** The strategy function itself. */
  evaluate: ApprovalStrategy;
}

// =============================================================================
// User-prompt surface
// =============================================================================

/**
 * Callback the engine invokes when no strategy pack auto-decides.
 * Callers (extension UI, CLI prompt, test stubs) return the user's
 * choice. Returning `undefined` is treated as rejection by the engine.
 */
export type UserApprovalPrompt = (
  request: ApprovalRequest,
) => Promise<ApprovalResponse | undefined>;

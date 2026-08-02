/**
 * Agent autoheal runtime contracts.
 *
 * Agent core consumes only these structural contracts. Concrete recovery
 * chains and strategy packs are contributed by skill/domain packages.
 */

// =============================================================================
// Levels
// =============================================================================

export type AutohealLevel = 1 | 2 | 3 | 4 | 5;

export const AUTOHEAL_LEVELS: readonly AutohealLevel[] = [1, 2, 3, 4, 5] as const;

export const AUTOHEAL_LEVEL_LABEL: Readonly<Record<AutohealLevel, string>> = {
  1: 'retry',
  2: 'degrade',
  3: 'substitute',
  4: 'subagent',
  5: 'escalate',
};

// =============================================================================
// Failure + context
// =============================================================================

export interface AutohealFailure {
  /** Tool or operation kind that produced the error. */
  readonly subject: string;
  /** Stable error code. Strategy packs may route on this. */
  readonly errorCode: string;
  /** Human-readable message for logs and diagnostics. */
  readonly message: string;
  /** Attempt number (0-based) on the current level. */
  readonly attempt: number;
  /** Original error object if available. */
  readonly cause?: unknown;
}

export interface AutohealContext {
  /** The primitive round this failure happened in. */
  readonly round: number;
  /** Workflow run id, when the runner is wired. */
  readonly runId?: string;
  /** Free-form metadata supplied by the host or skill runtime. */
  readonly metadata?: Record<string, unknown>;
}

// =============================================================================
// Attempts + outcomes
// =============================================================================

export type AutohealOutcome =
  | { readonly resolution: 'healed'; readonly level: AutohealLevel; readonly note: string }
  | { readonly resolution: 'pass'; readonly level: AutohealLevel; readonly note?: string }
  | {
      readonly resolution: 'aborted';
      readonly level: AutohealLevel;
      readonly reason: 'user-decline' | 'retry-exhausted' | 'unsubstitutable' | 'policy';
    };

// =============================================================================
// Policy + handlers
// =============================================================================

export interface AutohealPolicy {
  /** Maximum L1 retries before passing to L2. Default 2. */
  readonly maxRetries?: number;
  /** Skip L2 degrade altogether when the tool has no quality knob. */
  readonly skipDegrade?: boolean;
  /** Skip L3 substitute when no alternate tool is available. */
  readonly skipSubstitute?: boolean;
  /** Skip L4 subagent when no recovery subagent runtime is available. */
  readonly skipSubagent?: boolean;
}

export const DEFAULT_AUTOHEAL_POLICY: Required<AutohealPolicy> = {
  maxRetries: 2,
  skipDegrade: false,
  skipSubstitute: false,
  skipSubagent: false,
};

export type AutohealHandler = (
  failure: AutohealFailure,
  context: AutohealContext,
) => Promise<AutohealOutcome>;

export interface AutohealHandlers {
  readonly l1Retry?: AutohealHandler;
  readonly l2Degrade?: AutohealHandler;
  readonly l3Substitute?: AutohealHandler;
  readonly l4Subagent?: AutohealHandler;
  readonly l5Escalate?: AutohealHandler;
}

// =============================================================================
// Event port
// =============================================================================

export const AUTOHEAL_EVENT_CHANNELS = {
  L1_RETRY: 'execution.autoheal.l1.retry',
  L2_DEGRADE: 'execution.autoheal.l2.degrade',
  L3_SUBSTITUTE: 'execution.autoheal.l3.substitute',
  L4_TRIGGERED: 'execution.autoheal.l4.triggered',
  L5_ESCALATED: 'execution.autoheal.l5.escalated',
} as const;

export type AutohealEventChannel =
  (typeof AUTOHEAL_EVENT_CHANNELS)[keyof typeof AUTOHEAL_EVENT_CHANNELS];

interface AutohealRuntimeEventBase {
  /** Optional owning async activity identity; ordinary Agent recovery has none. */
  readonly runId?: string;
  readonly trigger: {
    readonly subject: string;
    readonly errorCode: string;
  };
  readonly at: number;
}

export type AutohealRuntimeEvent =
  | (AutohealRuntimeEventBase & {
      readonly channel: typeof AUTOHEAL_EVENT_CHANNELS.L1_RETRY;
      readonly attempt: number;
    })
  | (AutohealRuntimeEventBase & {
      readonly channel: typeof AUTOHEAL_EVENT_CHANNELS.L2_DEGRADE;
      readonly note: string;
    })
  | (AutohealRuntimeEventBase & {
      readonly channel: typeof AUTOHEAL_EVENT_CHANNELS.L3_SUBSTITUTE;
      readonly substitute: string;
    })
  | (AutohealRuntimeEventBase & {
      readonly channel: typeof AUTOHEAL_EVENT_CHANNELS.L4_TRIGGERED;
      readonly subagent: 'recovery' | 'diagnostic' | 'quality-check';
    })
  | (AutohealRuntimeEventBase & {
      readonly channel: typeof AUTOHEAL_EVENT_CHANNELS.L5_ESCALATED;
      readonly reason: 'user-suppressed' | 'retry-exhausted' | 'unsubstitutable';
    });

export interface AutohealEventEmitterPort {
  emit(event: AutohealRuntimeEvent): void;
}

export interface AutohealDiagnosticsPort {
  warn(message: string, details?: unknown): void;
  info?(message: string, details?: unknown): void;
}

// =============================================================================
// Chain factory
// =============================================================================

export interface AutohealChainConfig {
  readonly policy?: AutohealPolicy;
  readonly handlers?: AutohealHandlers;
  readonly eventBus?: AutohealEventEmitterPort;
  readonly diagnostics?: AutohealDiagnosticsPort;
  readonly now?: () => number;
}

export interface IAutohealChain {
  run(failure: AutohealFailure, context: AutohealContext): Promise<AutohealOutcome>;
}

export type AgentAutohealChainFactory = (config?: AutohealChainConfig) => IAutohealChain;

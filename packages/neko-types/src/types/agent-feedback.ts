import type { ExecutorHooks } from './agent';
import type { AgentObservation, PerceptionEvidence } from './agent-observation';
import type { DecisionRationale } from './decision-rationale';
import type { ChatMessage } from './platform';
import type { IProjectMemoryManager } from './project-memory';
import type { SubagentReviewResult } from './subagent-reviewer';

export interface AgentObservedToolResult {
  readonly callId?: string;
  readonly name?: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentToolReviewFeedbackSignal {
  readonly kind: 'tool-review';
  readonly observedAt: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: 'passed' | 'failed';
  readonly summary: string;
  readonly repairGuidance?: string;
  readonly escalationMessage?: string;
  readonly repeatKey?: string;
  readonly runId?: string;
  readonly evidence?: PerceptionEvidence;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentToolResultFeedbackAdapterInput {
  readonly result: AgentObservedToolResult;
  readonly toolArguments?: Record<string, unknown>;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly observedAt: number;
  readonly runId?: string;
  readonly locale?: string;
}

export interface AgentToolResultFeedbackAdapter {
  readonly id: string;
  createSignal(input: AgentToolResultFeedbackAdapterInput): AgentToolReviewFeedbackSignal | null;
}

export type AgentArtifactKind = string;

export interface AgentArtifactValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly severity?: string;
  readonly details?: Record<string, unknown>;
}

export interface AgentArtifactInvalidEvent {
  readonly channel?: string;
  readonly runId: string;
  readonly kind: AgentArtifactKind;
  readonly path: string;
  readonly issues: readonly AgentArtifactValidationIssue[];
  readonly at: number;
}

export interface AgentFeedbackMemoryExtractionInput {
  readonly messages: readonly ChatMessage[];
  readonly sourceEventIds?: readonly string[];
}

export interface AgentFeedbackMemoryExtractionSkipped {
  readonly kind: 'skipped';
  readonly timestamp: number;
  readonly sourceEventIds: string[];
  readonly reason: 'disabled' | 'no-facts';
}

export interface AgentFeedbackMemoryExtractionResult {
  readonly kind: 'extracted';
  readonly timestamp: number;
  readonly sourceEventIds: string[];
  readonly facts: Array<{
    readonly id: string;
    readonly content: string;
    readonly category: 'preference' | 'decision' | 'context' | 'action';
    readonly confidence: number;
    readonly destination: 'project';
  }>;
  readonly writeStatus: 'pending' | 'written' | 'rejected-by-user' | 'dedup';
}

export type AgentFeedbackMemoryExtractionOutcome =
  AgentFeedbackMemoryExtractionSkipped | AgentFeedbackMemoryExtractionResult;

export interface AgentProviderExpressionConceptDecision {
  readonly concept: string;
  readonly status: string;
  readonly output?: string;
  readonly reason?: string;
}

export type AgentFeedbackSignal =
  | {
      readonly kind: 'artifact-invalid';
      readonly observedAt: number;
      readonly runId: string;
      readonly artifactKind: AgentArtifactKind;
      readonly path: string;
      readonly issues: readonly AgentArtifactValidationIssue[];
    }
  | {
      readonly kind: 'tool-failure';
      readonly observedAt: number;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly error: string;
      readonly runId?: string;
    }
  | AgentToolReviewFeedbackSignal
  | {
      readonly kind: 'memory-extraction';
      readonly observedAt: number;
      readonly extraction: AgentFeedbackMemoryExtractionResult;
    }
  | {
      readonly kind: 'provider-card-observation';
      readonly observedAt: number;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly mode: 'agentic' | 'fallback' | 'native';
      readonly providerId?: string;
      readonly reason?: string;
      readonly styleFamily?: string;
      readonly concepts?: readonly string[];
      readonly conceptDecisions?: readonly AgentProviderExpressionConceptDecision[];
      readonly runId?: string;
      readonly metadata: Record<string, unknown>;
    }
  | {
      readonly kind: 'agent-observation';
      readonly observedAt: number;
      readonly observation: AgentObservation;
      readonly runId?: string;
    }
  | {
      readonly kind: 'decision-rationale';
      readonly observedAt: number;
      readonly rationale: DecisionRationale;
      readonly runId?: string;
    }
  | {
      readonly kind: 'subagent-review';
      readonly observedAt: number;
      readonly review: SubagentReviewResult;
      readonly runId?: string;
    };

export type AgentFeedbackDecision =
  | {
      readonly action: 'repair';
      readonly signalKind: 'artifact-invalid';
      readonly runId: string;
      readonly artifactKind: AgentArtifactKind;
      readonly path: string;
      readonly issueCount: number;
    }
  | {
      readonly action: 'repair';
      readonly signalKind: 'tool-failure';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly error: string;
      readonly runId?: string;
    }
  | {
      readonly action: 'repair';
      readonly signalKind: 'tool-review';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
      readonly repairGuidance?: string;
      readonly escalationMessage?: string;
      readonly repeatKey?: string;
      readonly runId?: string;
      readonly evidenceId?: string;
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'tool-review';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly summary: string;
    }
  | {
      readonly action: 'memorize';
      readonly signalKind: 'memory-extraction';
      readonly factCount: number;
      readonly writeStatus: AgentFeedbackMemoryExtractionResult['writeStatus'];
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'provider-card-observation';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly mode: 'agentic' | 'fallback' | 'native';
      readonly providerId?: string;
      readonly reason?: string;
      readonly styleFamily?: string;
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'agent-observation';
      readonly observationId: string;
      readonly confidence: AgentObservation['confidence'];
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'decision-rationale';
      readonly rationaleId: string;
      readonly confidence: DecisionRationale['confidence'];
      readonly observationIds: readonly string[];
      readonly evidenceIds: readonly string[];
      readonly riskLevel?: NonNullable<DecisionRationale['risk']>['level'];
    }
  | {
      readonly action: 'continue';
      readonly signalKind: 'subagent-review';
      readonly requestId: string;
      readonly reviewerId: string;
      readonly evidenceIds: readonly string[];
      readonly recommendationIds: readonly string[];
      readonly runId?: string;
    }
  | {
      readonly action: 'continue';
      readonly reason: 'no-actionable-signal';
    };

export interface AgentFeedbackControlPolicy {
  readonly escalationThreshold?: number;
  readonly agentObservationRequired?: boolean;
  readonly toolEvidenceMode?: 'off' | 'optional' | 'required-for-low-confidence';
}

export type AgentFeedbackFlowAction =
  | {
      readonly kind: 'set-guidance';
      readonly guidance: string;
      readonly signalKinds: ReadonlyArray<AgentFeedbackSignal['kind']>;
    }
  | {
      readonly kind: 'clear-guidance';
      readonly reason: 'no-actionable-signal' | 'continue' | 'memorize';
    }
  | {
      readonly kind: 'escalate-user';
      readonly message: string;
      readonly signalKind: 'artifact-invalid' | 'tool-failure' | 'tool-review';
      readonly repeatCount: number;
      readonly runId?: string;
    };

export interface AgentFeedbackEvaluationContext {
  readonly activeRunId?: string | null;
}

export interface AgentFeedbackCycle {
  readonly timestamp: number;
  readonly signals: readonly AgentFeedbackSignal[];
  readonly decisions: readonly AgentFeedbackDecision[];
  readonly actions: readonly AgentFeedbackFlowAction[];
  readonly activeRunId?: string | null;
}

export interface AgentFeedbackEvaluator {
  readonly id: string;
  evaluate(input: {
    readonly signals: readonly AgentFeedbackSignal[];
    readonly context: AgentFeedbackEvaluationContext;
  }): readonly AgentFeedbackDecision[];
}

export interface AgentFeedbackArbiter {
  readonly id: string;
  decide(input: {
    readonly signals: readonly AgentFeedbackSignal[];
    readonly decisions: readonly AgentFeedbackDecision[];
    readonly context: AgentFeedbackEvaluationContext;
    readonly signalHistory: readonly AgentFeedbackSignal[];
    readonly countSignals?: (signal: AgentFeedbackSignal) => number;
  }): readonly AgentFeedbackFlowAction[];
}

export interface AgentFeedbackCoordinator {
  getBeforeThinkHooks(): readonly ExecutorHooks[];
  observe(signal: AgentFeedbackSignal): void;
  evaluatePending(context?: AgentFeedbackEvaluationContext): AgentFeedbackCycle | null;
  getSignalHistory(): readonly AgentFeedbackSignal[];
  getDecisionHistory(): readonly AgentFeedbackDecision[];
  getActionHistory(): readonly AgentFeedbackFlowAction[];
  extractMemory(
    input: AgentFeedbackMemoryExtractionInput,
  ): Promise<AgentFeedbackMemoryExtractionOutcome>;
  dispose(): void;
}

export interface AgentFeedbackCoordinatorFactoryInput {
  readonly workspace?: AgentFeedbackWorkspacePort;
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly autoMemoryExtraction?: boolean;
  readonly controlPolicy?: AgentFeedbackControlPolicy;
}

export interface AgentFeedbackWorkspaceFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  readFile?(path: string, encoding: 'utf-8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

export interface AgentFeedbackWorkspacePort {
  readonly root: string;
  readonly fsOps: AgentFeedbackWorkspaceFsOps;
}

export type AgentFeedbackCoordinatorFactory = (
  input: AgentFeedbackCoordinatorFactoryInput,
) => AgentFeedbackCoordinator;

export type AgentToolReviewValidationSignal = AgentToolReviewFeedbackSignal;
export type AgentToolResultValidationAdapterInput = AgentToolResultFeedbackAdapterInput;
export type AgentToolResultValidationAdapter = AgentToolResultFeedbackAdapter;
export type AgentValidationMemoryExtractionInput = AgentFeedbackMemoryExtractionInput;
export type AgentValidationMemoryExtractionSkipped = AgentFeedbackMemoryExtractionSkipped;
export type AgentValidationMemoryExtractionResult = AgentFeedbackMemoryExtractionResult;
export type AgentValidationMemoryExtractionOutcome = AgentFeedbackMemoryExtractionOutcome;
export type AgentValidationSignal = AgentFeedbackSignal;
export type AgentValidationDecision = AgentFeedbackDecision;
export type AgentValidationControlPolicy = AgentFeedbackControlPolicy;
export type AgentValidationFlowAction = AgentFeedbackFlowAction;
export type AgentValidationEvaluationContext = AgentFeedbackEvaluationContext;
export type AgentValidationCycle = AgentFeedbackCycle;
export type AgentValidationEvaluator = AgentFeedbackEvaluator;
export type AgentValidationArbiter = AgentFeedbackArbiter;
export type AgentValidationCoordinator = AgentFeedbackCoordinator;
export type AgentValidationCoordinatorFactoryInput = AgentFeedbackCoordinatorFactoryInput;
export type AgentValidationWorkspaceFsOps = AgentFeedbackWorkspaceFsOps;
export type AgentValidationWorkspacePort = AgentFeedbackWorkspacePort;
export type AgentValidationCoordinatorFactory = AgentFeedbackCoordinatorFactory;
export interface AgentValidationLoopConfig {
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly compactLogging?: boolean;
  readonly autoMemoryExtraction?: boolean;
  readonly memoryRecall?: boolean;
  readonly validationCoordinator?: AgentValidationCoordinator;
  readonly validationCoordinatorFactory?: AgentValidationCoordinatorFactory;
  readonly toolResultValidationAdapters?: readonly AgentToolResultValidationAdapter[];
}

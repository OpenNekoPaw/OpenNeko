import type {
  AgentContinuationMetadata,
  AgentMessageQueueSnapshot,
  AgentQueuedMessageDisplayKind,
  AgentTurnSource,
} from '@neko-agent/types';
import type { CanvasWorkspaceProjectionResult, Task } from '@neko/shared';
import type { Message } from '../../types/state';
import type { TerminalArtifactFact } from '../../types/state';
import type { TerminalMarkdownPathEvent } from '../../markdown/path-observer';
import type { PromptCompositionFragmentProjection } from '@neko/agent';
import type { TuiPiRuntimeEvidence } from '../pi-runtime-owner';
import type { TuiPurposeModelRef, TuiToolModelPurpose } from '../types';

export const TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA = 'neko.tui-debug-automation.request.v1';
export const TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA = 'neko.tui-debug-automation.response.v1';

export type TuiDebugAutomationMethod =
  | 'session.create'
  | 'session.resume'
  | 'message.submit'
  | 'message.cancel'
  | 'terminal.resize'
  | 'session.waitForIdle'
  | 'session.facts'
  | 'session.dispose';

export type TuiDebugAutomationErrorCode =
  | 'invalid-json'
  | 'invalid-schema'
  | 'invalid-request'
  | 'unknown-method'
  | 'invalid-timeout'
  | 'session-not-found'
  | 'session-disposed'
  | 'session-not-ready'
  | 'session-timeout'
  | 'internal-error';

export interface TuiDebugAutomationRequest {
  readonly schema: typeof TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA;
  readonly id: string;
  readonly method: TuiDebugAutomationMethod;
  readonly params?: unknown;
}

export interface TuiDebugAutomationError {
  readonly code: TuiDebugAutomationErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export type TuiDebugAutomationResponse =
  | {
      readonly schema: typeof TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA;
      readonly id: string | null;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly schema: typeof TUI_DEBUG_AUTOMATION_RESPONSE_SCHEMA;
      readonly id: string | null;
      readonly ok: false;
      readonly error: TuiDebugAutomationError;
    };

export interface TuiDebugAutomationSessionCreateParams {
  readonly workDir?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly initialPrompt?: string;
  readonly runtimeConfig?: TuiDebugAutomationSessionRuntimeConfig;
  readonly modelPurposes?: Partial<Record<TuiToolModelPurpose, TuiPurposeModelRef>>;
}

export interface TuiDebugAutomationSessionRuntimeConfig {
  readonly executionMode?: 'auto' | 'ask' | 'plan';
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly outputFormat?: 'text' | 'json' | 'markdown';
}

export interface TuiDebugAutomationSessionResumeParams extends TuiDebugAutomationSessionCreateParams {
  readonly conversationId: string;
}

export interface TuiDebugAutomationSessionRefParams {
  readonly sessionId: string;
}

export interface TuiDebugAutomationMessageSubmitParams extends TuiDebugAutomationSessionRefParams {
  readonly prompt: string;
}

export type TuiDebugAutomationMessageCancelParams = TuiDebugAutomationSessionRefParams;

export interface TuiDebugAutomationMessageCancelled {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly accepted: boolean;
}

export interface TuiDebugAutomationTerminalResizeParams extends TuiDebugAutomationSessionRefParams {
  readonly columns: number;
  readonly rows: number;
}

export interface TuiDebugAutomationTerminalResized {
  readonly sessionId: string;
  readonly columns: number;
  readonly rows: number;
}

export interface TuiDebugAutomationWaitForIdleParams extends TuiDebugAutomationSessionRefParams {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface TuiDebugAutomationFactsParams extends TuiDebugAutomationSessionRefParams {
  readonly includeHistory?: boolean;
}

export type TuiDebugAutomationDisposeParams = TuiDebugAutomationSessionRefParams;

export interface TuiDebugAutomationSessionCreated {
  readonly sessionId: string;
  readonly conversationId: string;
}

export interface TuiDebugAutomationMessageSubmitted {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly queued: boolean;
  readonly idle: TuiDebugAutomationIdleState;
}

export interface TuiDebugAutomationIdleConcern {
  readonly idle: boolean;
  readonly terminal: boolean;
  readonly status?: string;
  readonly diagnostic?: string;
}

export interface TuiDebugAutomationIdleState {
  readonly turnIdle: TuiDebugAutomationIdleConcern;
  readonly backgroundTasksIdle: TuiDebugAutomationIdleConcern;
  readonly mediaDeliveryIdle: TuiDebugAutomationIdleConcern;
  readonly taskResultObservationIdle: TuiDebugAutomationIdleConcern;
  readonly continuationQueueIdle?: TuiDebugAutomationIdleConcern;
  readonly fullyIdle: boolean;
}

export interface TuiDebugAutomationModelIdentity {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
}

export interface TuiDebugAutomationEffectiveConfiguration {
  readonly digest: string;
  readonly runtime: Required<TuiDebugAutomationSessionRuntimeConfig>;
  readonly chat: TuiDebugAutomationModelIdentity;
  readonly modelPurposes: Readonly<
    Partial<Record<TuiToolModelPurpose, TuiDebugAutomationModelIdentity>>
  >;
}

export interface TuiDebugAutomationTimelineRowSummary {
  readonly id: string;
  readonly sequence: number;
  readonly kind: import('../../types/state').TerminalTimelineRowKind;
  readonly status: import('../../types/state').TerminalTimelineRowStatus;
  readonly content?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export interface TuiDebugAutomationTurnSummary {
  readonly id: string;
  readonly role: Message['role'];
  readonly source?: AgentTurnSource;
  readonly displayKind?: Message['displayKind'];
  readonly metadata?: AgentContinuationMetadata;
  readonly content: string;
  readonly todos: readonly {
    readonly content: string;
    readonly status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  }[];
  readonly isError?: boolean;
  readonly toolCalls: readonly TuiDebugAutomationToolCallSummary[];
  readonly timeline: readonly TuiDebugAutomationTimelineRowSummary[];
  readonly timestamp: number;
}

export interface TuiDebugAutomationContinuationFact {
  readonly id: string;
  readonly conversationId: string;
  readonly source: Exclude<AgentTurnSource, 'user'>;
  readonly displayKind: AgentQueuedMessageDisplayKind;
  readonly promptHash?: string;
  readonly metadata?: AgentContinuationMetadata;
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'discarded';
  readonly timestamp: number;
  readonly diagnostics: readonly TuiDebugAutomationDiagnostic[];
}

export interface TuiDebugAutomationDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
}

export interface TuiDebugAutomationToolCallSummary {
  readonly id: string;
  readonly name: string;
  readonly status:
    Message['toolCalls'][number]['status'] | import('../../types/state').TerminalTimelineRowStatus;
  readonly arguments?: unknown;
  readonly result?: unknown;
  readonly error?: string;
  readonly resultObservation: 'pending' | 'available' | 'error' | 'missing';
  readonly diagnostics: readonly TuiDebugAutomationDiagnostic[];
}

export interface TuiDebugAutomationTaskFact {
  readonly scope: Task['scope'];
  readonly id: string;
  readonly type: Task['type'];
  readonly status: Task['status'];
  readonly progress: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly retryCount: number;
  readonly lifecycle?: Task['lifecycle'];
  readonly metrics?: NonNullable<Task['output']>['metrics'];
  readonly resultObservation: {
    readonly status: 'pending' | 'available' | 'observed' | 'failed' | 'missing';
    readonly observationIds: readonly string[];
  };
  readonly diagnostics: readonly TuiDebugAutomationDiagnostic[];
}

export interface TuiDebugAutomationCanvasFacts {
  readonly messageSummaries: readonly string[];
  readonly toolCallSummaries: readonly TuiDebugAutomationToolCallSummary[];
}

export interface TuiDebugAutomationMarkdownFacts {
  readonly pathEvents: readonly TerminalMarkdownPathEvent[];
  readonly droppedPathEventCount: number;
}

export interface TuiDebugAutomationWorkspaceBoardProjectionFact {
  readonly deliveryIdHash?: string;
  readonly status: CanvasWorkspaceProjectionResult['status'];
  readonly targetKind?: NonNullable<CanvasWorkspaceProjectionResult['target']>['kind'];
  readonly revision?: string;
  readonly nodeIds: readonly string[];
  readonly artifactRoleCounts?: Readonly<Record<'source' | 'analysis' | 'output', number>>;
  readonly writerEpoch?: number;
  readonly diagnosticCodes: readonly string[];
}

export interface TuiDebugAutomationConversationPersistenceFacts {
  readonly authority: 'pi-session' | 'memory';
  readonly catalog: 'sqlite' | 'memory';
  readonly databaseScope: 'user-global' | 'isolated-test';
  readonly resume: {
    readonly status: 'new' | 'restored' | 'not-found';
    readonly requestedConversationId?: string;
    readonly restoredConversationId?: string;
    readonly recordSource?: 'pi-session';
    readonly restoredMessageCount: number;
  };
}

export interface TuiDebugAutomationSessionFacts {
  readonly sessionId: string;
  readonly conversationId: string;
  readonly ready: boolean;
  readonly model: TuiDebugAutomationModelIdentity;
  readonly configuration: TuiDebugAutomationEffectiveConfiguration;
  readonly idle: TuiDebugAutomationIdleState;
  readonly turns: readonly TuiDebugAutomationTurnSummary[];
  readonly history?: readonly unknown[];
  /** Legacy activation lifecycle is intentionally absent; Pi Skills execute as turns. */
  readonly skillActivations: readonly never[];
  readonly tasks: readonly TuiDebugAutomationTaskFact[];
  readonly messageQueue: AgentMessageQueueSnapshot | null;
  readonly continuations: readonly TuiDebugAutomationContinuationFact[];
  readonly promptComposition: readonly PromptCompositionFragmentProjection[];
  readonly artifacts: readonly TerminalArtifactFact[];
  readonly workspaceBoardProjections: readonly TuiDebugAutomationWorkspaceBoardProjectionFact[];
  readonly runtimeErrors: readonly string[];
  readonly canvas: TuiDebugAutomationCanvasFacts;
  readonly markdown: TuiDebugAutomationMarkdownFacts;
  readonly conversationPersistence: TuiDebugAutomationConversationPersistenceFacts;
  readonly piRuntime: TuiPiRuntimeEvidence | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly contextTokens?: number;
  };
  readonly timing: {
    readonly capturedAt: number;
    readonly activeStartedAt?: number;
    readonly firstTurnAt?: number;
    readonly lastTurnAt?: number;
  };
  readonly iteration: {
    readonly current: number;
    readonly max: number;
  };
  readonly retries: {
    readonly taskRetryCount: number;
    readonly tasksWithRetries: number;
  };
  readonly evidenceCompleteness: TuiDebugAutomationEvidenceCompleteness;
}

export interface TuiDebugAutomationCollectionCompleteness {
  readonly limit: number;
  readonly droppedCount: number;
}

export interface TuiDebugAutomationEvidenceCompleteness {
  readonly turns: TuiDebugAutomationCollectionCompleteness;
  readonly turnToolCalls: TuiDebugAutomationCollectionCompleteness;
  readonly timelineRows: TuiDebugAutomationCollectionCompleteness;
  readonly skillActivations: TuiDebugAutomationCollectionCompleteness;
  readonly tasks: TuiDebugAutomationCollectionCompleteness;
  readonly continuations: TuiDebugAutomationCollectionCompleteness;
  readonly promptComposition: TuiDebugAutomationCollectionCompleteness;
  readonly artifacts: TuiDebugAutomationCollectionCompleteness;
  readonly workspaceBoardProjections: TuiDebugAutomationCollectionCompleteness;
  readonly runtimeErrors: TuiDebugAutomationCollectionCompleteness;
  readonly canvasMessageSummaries: TuiDebugAutomationCollectionCompleteness;
  readonly canvasToolCallSummaries: TuiDebugAutomationCollectionCompleteness;
  readonly markdownPathEvents: TuiDebugAutomationCollectionCompleteness;
  readonly history?: TuiDebugAutomationCollectionCompleteness;
}

export interface TuiDebugAutomationAppPort {
  readonly ownerKind: 'tui-app-session-owner';
  isReady(): boolean;
  getInitializationError(): Error | null;
  getConversationId(): string;
  submitMessage(input: { readonly prompt: string }): Promise<void>;
  cancelActiveMessage(): boolean;
  resizeTerminal(input: { readonly columns: number; readonly rows: number }): void;
  waitForIdle(input: {
    readonly timeoutMs: number;
    readonly pollIntervalMs: number;
  }): Promise<TuiDebugAutomationIdleState>;
  readFacts(input: {
    readonly sessionId: string;
    readonly includeHistory: boolean;
  }): Promise<TuiDebugAutomationSessionFacts>;
}

export interface TuiDebugAutomationController {
  bind(port: TuiDebugAutomationAppPort): void;
  unbind(port: TuiDebugAutomationAppPort): void;
  readMarkdownFacts(): TuiDebugAutomationMarkdownFacts;
  dispose(): void;
}

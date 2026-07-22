import { createHash } from 'node:crypto';
import type { AgentMessageQueueSnapshot } from '@neko-agent/types';
import type {
  CanvasWorkspaceProjectionResult,
  GeneratedAssetRevisionRef,
  Task,
} from '@neko/shared';
import type { PromptCompositionFragmentProjection } from '@neko/agent';
import type { CreatorVisibleArtifactCandidate } from '@neko/agent/runtime';
import type { TuiConversationStores } from '../../runtime/tui-application-runtime';
import type { Message } from '../../types/state';
import type {
  TuiDebugAutomationAppPort,
  TuiDebugAutomationCanvasFacts,
  TuiDebugAutomationIdleConcern,
  TuiDebugAutomationIdleState,
  TuiDebugAutomationMarkdownFacts,
  TuiDebugAutomationSessionFacts,
  TuiDebugAutomationTaskFact,
  TuiDebugAutomationToolCallSummary,
  TuiDebugAutomationTurnSummary,
  TuiDebugAutomationWorkspaceBoardDeliveryFacts,
} from './types';
import type { TuiConversationPersistenceSnapshot } from '../../host/tui-local-metadata-binding';
import type { TuiPiRuntimeEvidence } from '../pi-runtime-owner';
import { TuiDebugAutomationProtocolError } from './protocol';
import {
  projectGeneratedOutputLifecycleArtifactFacts,
  projectCreatorVisibleArtifactFacts,
  projectTaskOutputArtifactFacts,
} from '../artifact-fact-projector';

const FACT_LIMITS = Object.freeze({
  turns: 512,
  turnToolCalls: 256,
  timelineRows: 2_048,
  history: 512,
  skillActivations: 128,
  tasks: 512,
  continuations: 512,
  promptComposition: 256,
  artifacts: 512,
  workspaceBoardProjections: 128,
  runtimeErrors: 256,
  canvasMessageSummaries: 128,
  canvasToolCallSummaries: 128,
});

export interface TuiAutomationSessionHandle {
  readonly isReady: boolean;
  readonly submit: (prompt: string) => Promise<void>;
  readonly cancel: () => void;
  readonly listTasks: () => Promise<readonly Task[]>;
  readonly getCurrentConversationId: () => string;
  readonly getHistory: () => readonly unknown[];
  readonly getConversationPersistenceSnapshot: () => TuiConversationPersistenceSnapshot | null;
  readonly getPiRuntimeEvidence?: () => TuiPiRuntimeEvidence | null;
  readonly getMessageQueueSnapshot: () => AgentMessageQueueSnapshot | null;
  readonly getPromptCompositionProjection?: () => readonly PromptCompositionFragmentProjection[];
  readonly getWorkspaceBoardProjections?: () => readonly CanvasWorkspaceProjectionResult[];
  readonly getWorkspaceBoardDeliveryObservability?: () => TuiDebugAutomationWorkspaceBoardDeliveryFacts;
  readonly getGeneratedOutputLifecycles?: () => readonly GeneratedAssetRevisionRef[];
  readonly getCreatorVisibleArtifacts?: () => readonly CreatorVisibleArtifactCandidate[];
  readonly getPendingTaskResultDeliveryCount?: () => number;
}

export interface TuiAutomationAppPortOptions {
  readonly stores: TuiConversationStores;
  readonly readHandle: () => TuiAutomationSessionHandle;
  readonly submitInput: (input: string) => Promise<void>;
  readonly confirmToolCall?: (toolCallId: string, approved: boolean) => void;
  readonly readMarkdownFacts: () => TuiDebugAutomationMarkdownFacts;
}

export function createTuiAutomationAppPort(
  options: TuiAutomationAppPortOptions,
): TuiDebugAutomationAppPort {
  const { stores } = options;
  const inFlightSubmissions = new Set<Promise<void>>();
  let latestSubmission: Promise<void> | null = null;
  return {
    ownerKind: 'tui-app-session-owner',

    isReady(): boolean {
      return options.readHandle().isReady;
    },

    getInitializationError(): Error | null {
      if (options.readHandle().isReady) {
        return null;
      }
      return stores.agent.getState().error;
    },

    getConversationId(): string {
      return options.readHandle().getCurrentConversationId();
    },

    async submitMessage(input): Promise<void> {
      const handle = options.readHandle();
      if (!handle.isReady) {
        throw new TuiDebugAutomationProtocolError(
          'session-not-ready',
          'TUI session is not ready for message submission.',
        );
      }
      const messageCountBeforeSubmit = stores.conversation.getState().messages.length;
      const execution = options.submitInput(input.prompt);
      latestSubmission = execution;
      inFlightSubmissions.add(execution);
      void execution.finally(() => {
        inFlightSubmissions.delete(execution);
      });
      await waitForSubmissionAcceptance(execution, messageCountBeforeSubmit, stores);
    },

    cancelActiveMessage(): boolean {
      const handle = options.readHandle();
      const wasRunning = stores.agent.getState().status === 'running';
      handle.cancel();
      return wasRunning;
    },

    async confirmPendingTool(input) {
      const startedAt = Date.now();
      for (;;) {
        const pending = stores.ui.getState().pendingApproval;
        if (pending) {
          if (!options.confirmToolCall) {
            throw new TuiDebugAutomationProtocolError(
              'session-not-ready',
              'TUI Tool confirmation owner is unavailable.',
            );
          }
          if (pending.toolName !== input.toolName) {
            throw new TuiDebugAutomationProtocolError(
              'invalid-request',
              `Pending Tool confirmation is for ${pending.toolName}, not ${input.toolName}.`,
            );
          }
          pending.resolve(input.approved);
          options.confirmToolCall(pending.toolCallId, input.approved);
          return {
            toolCallId: pending.toolCallId,
            toolName: pending.toolName,
            approved: input.approved,
          };
        }
        if (Date.now() - startedAt >= input.timeoutMs) {
          throw new TuiDebugAutomationProtocolError(
            'session-timeout',
            `Timed out waiting for ${input.toolName} confirmation after ${input.timeoutMs}ms.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },

    resizeTerminal(input): void {
      stores.ui.getState().setTerminalSize({ columns: input.columns, rows: input.rows });
    },

    async waitForIdle(input): Promise<TuiDebugAutomationIdleState> {
      if (latestSubmission) await latestSubmission;
      await Promise.all([...inFlightSubmissions]);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      return waitForTuiAutomationIdle({
        readIdle: async () => readTuiAutomationIdleState(options.readHandle(), stores),
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
      });
    },

    async readFacts(input): Promise<TuiDebugAutomationSessionFacts> {
      const handle = options.readHandle();
      const idle = await readTuiAutomationIdleState(handle, stores);
      const messageQueue = handle.getMessageQueueSnapshot();
      const rawContinuations = readContinuationFacts(
        messageQueue,
        stores,
        handle.getCurrentConversationId(),
      );
      const continuations = bounded(rawContinuations, FACT_LIMITS.continuations);
      const promptComposition = bounded(
        [...(handle.getPromptCompositionProjection?.() ?? [])],
        FACT_LIMITS.promptComposition,
      );
      const rawTasks = await readTasks(handle);
      const tasks = bounded(projectTaskFacts(rawTasks, rawContinuations), FACT_LIMITS.tasks);
      const turns = readTurnSummaries(stores);
      const skillActivations = bounded([], FACT_LIMITS.skillActivations);
      const artifacts = bounded(
        readArtifactFacts(
          stores,
          rawTasks,
          handle.getGeneratedOutputLifecycles?.() ?? [],
          handle.getCreatorVisibleArtifacts?.() ?? [],
        ),
        FACT_LIMITS.artifacts,
      );
      const workspaceBoardProjections = bounded(
        projectWorkspaceBoardProjectionFacts(handle.getWorkspaceBoardProjections?.() ?? []),
        FACT_LIMITS.workspaceBoardProjections,
      );
      const runtimeErrors = bounded(readRuntimeErrors(stores), FACT_LIMITS.runtimeErrors);
      const canvas = readCanvasFacts(stores);
      const markdown = options.readMarkdownFacts();
      const conversationPersistence = handle.getConversationPersistenceSnapshot();
      if (!conversationPersistence) {
        throw new TuiDebugAutomationProtocolError(
          'session-not-ready',
          'Conversation persistence facts are unavailable before storage initialization.',
        );
      }
      const history = input.includeHistory
        ? bounded([...handle.getHistory()], FACT_LIMITS.history)
        : undefined;
      const agentState = stores.agent.getState();
      const taskRetryCount = rawTasks.reduce((total, task) => total + (task.retryCount ?? 0), 0);
      return {
        sessionId: input.sessionId,
        conversationId: handle.getCurrentConversationId(),
        ready: handle.isReady,
        model: readModelIdentity(stores),
        configuration: readEffectiveConfiguration(stores),
        idle,
        turns: turns.items,
        ...(history ? { history: history.items } : {}),
        skillActivations: skillActivations.items,
        tasks: tasks.items,
        messageQueue,
        continuations: continuations.items,
        promptComposition: promptComposition.items,
        artifacts: artifacts.items,
        workspaceBoardProjections: workspaceBoardProjections.items,
        workspaceBoardDelivery: handle.getWorkspaceBoardDeliveryObservability?.() ?? {
          canonicalSubmissionCount: 0,
          resumeScanCount: 0,
          legacyFallbackCounts: {
            activeCanvas: 0,
            recentCanvas: 0,
            directWriter: 0,
            genericSendToCanvas: 0,
          },
        },
        runtimeErrors: runtimeErrors.items,
        canvas: canvas.value,
        markdown,
        conversationPersistence,
        piRuntime: handle.getPiRuntimeEvidence?.() ?? null,
        usage: {
          inputTokens: agentState.usage.input,
          outputTokens: agentState.usage.output,
          totalTokens: agentState.usage.total,
          ...(agentState.contextTokens.count !== null
            ? { contextTokens: agentState.contextTokens.count }
            : {}),
        },
        timing: {
          capturedAt: Date.now(),
          ...(agentState.startTime !== null ? { activeStartedAt: agentState.startTime } : {}),
          ...(turns.items[0] ? { firstTurnAt: turns.items[0].timestamp } : {}),
          ...(turns.items.at(-1) ? { lastTurnAt: turns.items.at(-1)?.timestamp } : {}),
        },
        iteration: { ...agentState.iteration },
        retries: {
          taskRetryCount,
          tasksWithRetries: rawTasks.filter((task) => (task.retryCount ?? 0) > 0).length,
        },
        evidenceCompleteness: {
          turns: turns.completeness,
          turnToolCalls: turns.toolCalls,
          timelineRows: turns.timelineRows,
          skillActivations: skillActivations.completeness,
          tasks: tasks.completeness,
          continuations: continuations.completeness,
          promptComposition: promptComposition.completeness,
          artifacts: artifacts.completeness,
          workspaceBoardProjections: workspaceBoardProjections.completeness,
          runtimeErrors: runtimeErrors.completeness,
          canvasMessageSummaries: canvas.messageSummaries,
          canvasToolCallSummaries: canvas.toolCallSummaries,
          markdownPathEvents: {
            limit: 2_048,
            droppedCount: markdown.droppedPathEventCount,
          },
          ...(history ? { history: history.completeness } : {}),
        },
      };
    },
  };
}

function projectWorkspaceBoardProjectionFacts(
  results: readonly CanvasWorkspaceProjectionResult[],
): TuiDebugAutomationSessionFacts['workspaceBoardProjections'] {
  return results.map((result) => ({
    ...(result.deliveryId ? { deliveryIdHash: hashText(result.deliveryId) } : {}),
    status: result.status,
    ...(result.target ? { targetKind: result.target.kind } : {}),
    ...(result.revision ? { revision: result.revision } : {}),
    nodeIds: [...(result.nodeIds ?? [])],
    connectionIds: [...(result.connectionIds ?? [])],
    ...(result.artifactRoleCounts ? { artifactRoleCounts: result.artifactRoleCounts } : {}),
    ...(result.writerEpoch ? { writerEpoch: result.writerEpoch } : {}),
    diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
  }));
}

async function waitForSubmissionAcceptance(
  execution: Promise<void>,
  messageCountBeforeSubmit: number,
  stores: TuiConversationStores,
): Promise<void> {
  let settled = false;
  void execution.finally(() => {
    settled = true;
  });
  const startedAt = Date.now();
  for (;;) {
    const agentStatus = stores.agent.getState().status;
    if (agentStatus === 'running') return;
    if (settled && hasProjectedAssistantAfter(messageCountBeforeSubmit, stores)) return;
    if (settled && agentStatus === 'error') return;
    if (Date.now() - startedAt >= 5_000) {
      throw new TuiDebugAutomationProtocolError(
        'session-timeout',
        'TUI message submission was not accepted or projected within 5000ms.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function hasProjectedAssistantAfter(
  messageCountBeforeSubmit: number,
  stores: TuiConversationStores,
): boolean {
  return stores.conversation
    .getState()
    .messages.slice(messageCountBeforeSubmit)
    .some((message) => message.role === 'assistant');
}

async function waitForTuiAutomationIdle(input: {
  readonly readIdle: () => Promise<TuiDebugAutomationIdleState>;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}): Promise<TuiDebugAutomationIdleState> {
  const startedAt = Date.now();
  for (;;) {
    const idle = await input.readIdle();
    if (idle.fullyIdle) {
      return idle;
    }
    if (Date.now() - startedAt >= input.timeoutMs) {
      throw new TuiDebugAutomationProtocolError(
        'session-timeout',
        `TUI debug automation idle wait timed out after ${input.timeoutMs}ms.`,
        idle,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }
}

async function readTuiAutomationIdleState(
  handle: TuiAutomationSessionHandle,
  stores: TuiConversationStores,
): Promise<TuiDebugAutomationIdleState> {
  const agentState = stores.agent.getState();
  const tasks = await readTasks(handle);
  const runningTasks = tasks.filter((task) => !isTerminalTaskStatus(String(task.status)));
  const taskDiagnostic =
    runningTasks.length > 0 ? `${runningTasks.length} background task(s) still active.` : undefined;
  const turnIdle =
    agentState.status === 'idle' || agentState.status === 'error'
      ? idleConcern(agentState.status, true)
      : busyConcern(agentState.status);
  const backgroundTasksIdle =
    runningTasks.length === 0 ? idleConcern('idle', true) : busyConcern('running', taskDiagnostic);
  const pendingTaskResultDeliveries = handle.getPendingTaskResultDeliveryCount?.() ?? 0;
  const deliveryDiagnostic =
    pendingTaskResultDeliveries > 0
      ? `${pendingTaskResultDeliveries} terminal task result delivery operation(s) pending.`
      : undefined;
  const mediaDeliveryIdle =
    backgroundTasksIdle.idle && pendingTaskResultDeliveries === 0
      ? idleConcern('idle', true)
      : busyConcern('delivering', deliveryDiagnostic ?? taskDiagnostic);
  const taskResultObservationIdle =
    backgroundTasksIdle.idle && pendingTaskResultDeliveries === 0
      ? idleConcern('idle', true)
      : busyConcern('observing', deliveryDiagnostic ?? taskDiagnostic);
  const queuedContinuations = (handle.getMessageQueueSnapshot()?.items ?? []).filter((item) =>
    isContinuationSource(item.source),
  );
  const continuationQueueIdle =
    queuedContinuations.length === 0
      ? idleConcern('idle', true)
      : busyConcern('queued', `${queuedContinuations.length} continuation(s) pending.`);

  return {
    turnIdle,
    backgroundTasksIdle,
    mediaDeliveryIdle,
    taskResultObservationIdle,
    continuationQueueIdle,
    fullyIdle:
      turnIdle.idle &&
      backgroundTasksIdle.idle &&
      mediaDeliveryIdle.idle &&
      taskResultObservationIdle.idle &&
      continuationQueueIdle.idle,
  };
}

async function readTasks(handle: TuiAutomationSessionHandle): Promise<readonly Task[]> {
  if (!handle.isReady) {
    return [];
  }
  return handle.listTasks();
}

function idleConcern(status: string, terminal: boolean): TuiDebugAutomationIdleConcern {
  return {
    idle: true,
    terminal,
    status,
  };
}

function busyConcern(status: string, diagnostic?: string): TuiDebugAutomationIdleConcern {
  return {
    idle: false,
    terminal: false,
    status,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function isTerminalTaskStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function readModelIdentity(stores: TuiConversationStores): TuiDebugAutomationSessionFacts['model'] {
  const config = stores.config.getState().config;
  return {
    providerId: config.chatModel?.providerId ?? config.provider,
    modelId: config.chatModel?.modelId ?? config.model,
    ...(config.chatModel?.providerExpressionProfileId
      ? { providerExpressionProfileId: config.chatModel.providerExpressionProfileId }
      : {}),
  };
}

function readEffectiveConfiguration(
  stores: TuiConversationStores,
): TuiDebugAutomationSessionFacts['configuration'] {
  const config = stores.config.getState().config;
  const projection: Omit<TuiDebugAutomationSessionFacts['configuration'], 'digest'> = {
    runtime: {
      executionMode: stores.agent.getState().executionMode,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      thinkingBudget: config.thinkingBudget,
      outputFormat: config.outputFormat,
    },
    chat: readModelIdentity(stores),
    modelPurposes: Object.fromEntries(
      Object.entries(config.purposeModels ?? {}).map(([purpose, model]) => [
        purpose,
        { providerId: model.providerId, modelId: model.modelId },
      ]),
    ),
  };
  return {
    digest: `sha256:${createHash('sha256').update(stableStringify(projection)).digest('hex')}`,
    ...projection,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Cannot hash undefined TUI configuration value');
  return serialized;
}

function readTurnSummaries(stores: TuiConversationStores): {
  readonly items: readonly TuiDebugAutomationTurnSummary[];
  readonly completeness: import('./types').TuiDebugAutomationCollectionCompleteness;
  readonly toolCalls: import('./types').TuiDebugAutomationCollectionCompleteness;
  readonly timelineRows: import('./types').TuiDebugAutomationCollectionCompleteness;
} {
  const messages = bounded(stores.conversation.getState().messages, FACT_LIMITS.turns);
  let droppedToolCalls = 0;
  let droppedTimelineRows = 0;
  const items = messages.items.map((message) => ({
    id: message.id,
    role: message.role,
    ...(message.source ? { source: message.source } : {}),
    ...(message.displayKind ? { displayKind: message.displayKind } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    content: readMessageSummaryContent(message),
    todos: message.todos.map((todo) => ({ ...todo })),
    ...(message.isError ? { isError: true } : {}),
    toolCalls: (() => {
      const projected = bounded(readMessageToolCallSummaries(message), FACT_LIMITS.turnToolCalls);
      droppedToolCalls += projected.completeness.droppedCount;
      return projected.items;
    })(),
    timeline: (() => {
      const projected = bounded(message.timelineRows ?? [], FACT_LIMITS.timelineRows);
      droppedTimelineRows += projected.completeness.droppedCount;
      return projected.items.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        kind: row.kind,
        status: row.status,
        ...(row.content !== undefined ? { content: row.content } : {}),
        ...(row.toolCallId !== undefined ? { toolCallId: row.toolCallId } : {}),
        ...(row.toolName !== undefined ? { toolName: row.toolName } : {}),
      }));
    })(),
    timestamp: message.timestamp,
  }));
  return {
    items,
    completeness: messages.completeness,
    toolCalls: { limit: FACT_LIMITS.turnToolCalls, droppedCount: droppedToolCalls },
    timelineRows: { limit: FACT_LIMITS.timelineRows, droppedCount: droppedTimelineRows },
  };
}

export function readContinuationFacts(
  queueSnapshot: import('@neko-agent/types').AgentMessageQueueSnapshot | null,
  stores: TuiConversationStores,
  conversationId = queueSnapshot?.conversationId,
): import('./types').TuiDebugAutomationContinuationFact[] {
  const facts: import('./types').TuiDebugAutomationContinuationFact[] = [];
  for (const message of stores.conversation.getState().messages) {
    if (!message.source || !isContinuationSource(message.source)) continue;
    if (!conversationId) {
      throw new Error('Cannot project continuation facts without conversation identity.');
    }
    facts.push({
      id: message.id,
      conversationId,
      source: message.source,
      displayKind: normalizeContinuationDisplayKind(message.displayKind),
      promptHash: hashText(readMessageSummaryContent(message)),
      ...(message.metadata ? { metadata: message.metadata } : {}),
      status: message.metadata?.status ?? 'running',
      timestamp: message.timestamp,
      diagnostics: continuationDiagnostics(message.source, message.metadata),
    });
  }
  for (const item of queueSnapshot?.items ?? []) {
    if (!isContinuationSource(item.source)) continue;
    facts.push({
      id: item.id,
      conversationId: item.conversationId,
      source: normalizeContinuationSource(item.source),
      displayKind: item.displayKind ?? normalizeContinuationDisplayKind(item.displayKind),
      promptHash: hashText(item.content),
      ...(item.metadata ? { metadata: item.metadata } : {}),
      status: item.metadata?.status ?? 'queued',
      timestamp: item.createdAt,
      diagnostics: continuationDiagnostics(normalizeContinuationSource(item.source), item.metadata),
    });
  }
  return facts;
}

export function projectTaskFacts(
  tasks: readonly Task[],
  continuations: readonly import('./types').TuiDebugAutomationContinuationFact[],
): readonly TuiDebugAutomationTaskFact[] {
  return tasks.map((task) => {
    const observations = continuations
      .filter((item) => item.metadata?.taskId === task.id && item.metadata.observationId)
      .map((item) => item.metadata?.observationId)
      .filter((item): item is string => typeof item === 'string');
    const providerId = readPayloadString(task, 'providerId');
    const modelId = readPayloadString(task, 'modelId');
    const diagnostics: import('./types').TuiDebugAutomationDiagnostic[] = [];
    if (task.status === 'completed' && task.output === undefined) {
      diagnostics.push({
        code: 'completed-task-output-missing',
        severity: 'error',
        message: `Completed task ${task.id} has no output projection.`,
      });
    }
    if (task.output?.error || task.error) {
      diagnostics.push({
        code: 'task-output-error',
        severity: 'error',
        message: task.output?.error ?? task.error ?? 'Task failed.',
      });
    }
    return {
      scope: task.scope,
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
      retryCount: task.retryCount ?? 0,
      ...(task.lifecycle ? { lifecycle: task.lifecycle } : {}),
      ...(task.output?.metrics ? { metrics: task.output.metrics } : {}),
      resultObservation: {
        status:
          observations.length > 0
            ? 'observed'
            : task.status === 'failed' || task.status === 'cancelled'
              ? 'failed'
              : task.status === 'completed' && task.output !== undefined
                ? 'available'
                : task.status === 'completed'
                  ? 'missing'
                  : 'pending',
        observationIds: observations,
      },
      diagnostics,
    };
  });
}

function readPayloadString(task: Task, key: string): string | undefined {
  const value = task.input.payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function continuationDiagnostics(
  source: Exclude<import('@neko-agent/types').AgentTurnSource, 'user'>,
  metadata: import('@neko-agent/types').AgentContinuationMetadata | undefined,
): readonly import('./types').TuiDebugAutomationDiagnostic[] {
  if (source === 'task-result-continuation' && (!metadata?.taskId || !metadata.observationId)) {
    return [
      {
        code: 'task-continuation-identity-incomplete',
        severity: 'error',
        message: 'Task continuation is missing taskId or observationId.',
      },
    ];
  }
  if (source === 'subagent-result-continuation' && !metadata?.subagentId) {
    return [
      {
        code: 'subagent-continuation-identity-incomplete',
        severity: 'error',
        message: 'Subagent continuation is missing subagentId.',
      },
    ];
  }
  return [];
}

function hashText(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isContinuationSource(
  source:
    | import('@neko-agent/types').AgentQueuedMessageSource
    | import('@neko-agent/types').AgentTurnSource,
): source is Exclude<import('@neko-agent/types').AgentTurnSource, 'user'> {
  return (
    source === 'task-result-continuation' ||
    source === 'subagent-result-continuation' ||
    source === 'system-continuation'
  );
}

function normalizeContinuationSource(
  source: import('@neko-agent/types').AgentQueuedMessageSource,
): Exclude<import('@neko-agent/types').AgentTurnSource, 'user'> {
  if (source === 'task-result-continuation') return source;
  if (source === 'subagent-result-continuation') return source;
  return 'system-continuation';
}

function normalizeContinuationDisplayKind(
  displayKind:
    import('@neko-agent/types').AgentQueuedMessageDisplayKind | Message['displayKind'] | undefined,
): import('@neko-agent/types').AgentQueuedMessageDisplayKind {
  if (
    displayKind === 'task-continuation' ||
    displayKind === 'subagent-continuation' ||
    displayKind === 'system-continuation'
  ) {
    return displayKind;
  }
  return 'system-continuation';
}

export function readMessageSummaryContent(message: Message): string {
  if (message.content.trim().length > 0) {
    return message.content;
  }
  const timelineText = (message.timelineRows ?? [])
    .filter((row) => row.kind === 'assistant_text' && row.content)
    .map((row) => row.content)
    .join('');
  return timelineText || message.content;
}

export function readMessageToolCallSummaries(
  message: Message,
): readonly TuiDebugAutomationToolCallSummary[] {
  const summaries = new Map<string, TuiDebugAutomationToolCallSummary>();
  for (const toolCall of message.toolCalls) {
    summaries.set(toolCall.id, projectToolCallSummary(toolCall));
  }
  for (const row of message.timelineRows ?? []) {
    if (row.kind !== 'tool' || !row.toolCallId || !row.toolName) continue;
    const existing = summaries.get(row.toolCallId);
    const result =
      row.toolResult !== undefined
        ? row.toolResult
        : existing?.result !== undefined
          ? existing.result
          : row.resultSummary;
    const error = row.toolError ?? existing?.error ?? row.diagnosticCode;
    summaries.set(row.toolCallId, {
      id: row.toolCallId,
      name: row.toolName,
      status: row.status,
      ...(row.toolArguments
        ? { arguments: row.toolArguments }
        : existing?.arguments
          ? { arguments: existing.arguments }
          : {}),
      ...(result !== undefined ? { result } : {}),
      ...(error ? { error } : {}),
      resultObservation: error
        ? 'error'
        : result !== undefined
          ? 'available'
          : row.status === 'pending' || row.status === 'running' || row.status === 'waiting'
            ? 'pending'
            : 'missing',
      diagnostics: error
        ? [{ code: row.diagnosticCode ?? 'tool-call-error', severity: 'error', message: error }]
        : [],
    });
  }
  return [...summaries.values()];
}

function readRuntimeErrors(stores: TuiConversationStores): readonly string[] {
  const agentError = stores.agent.getState().error;
  const messageErrors = stores.conversation
    .getState()
    .messages.filter((message) => message.isError)
    .map((message) => message.content);
  return [...(agentError ? [agentError.message] : []), ...messageErrors];
}

function readCanvasFacts(stores: TuiConversationStores): {
  readonly value: TuiDebugAutomationCanvasFacts;
  readonly messageSummaries: import('./types').TuiDebugAutomationCollectionCompleteness;
  readonly toolCallSummaries: import('./types').TuiDebugAutomationCollectionCompleteness;
} {
  const messages = stores.conversation.getState().messages;
  const canvasMessages = messages.filter((message) => messageContainsCanvasSignal(message));
  const messageSummaries = bounded(
    canvasMessages.map((message) => message.content).filter(Boolean),
    FACT_LIMITS.canvasMessageSummaries,
  );
  const toolCallSummaries = bounded(
    messages
      .flatMap((message) => message.toolCalls)
      .filter((toolCall) => safeJsonIncludesCanvas(toolCall))
      .map(projectToolCallSummary),
    FACT_LIMITS.canvasToolCallSummaries,
  );
  return {
    value: {
      messageSummaries: messageSummaries.items,
      toolCallSummaries: toolCallSummaries.items,
    },
    messageSummaries: messageSummaries.completeness,
    toolCallSummaries: toolCallSummaries.completeness,
  };
}

function bounded<T>(
  items: readonly T[],
  limit: number,
): {
  readonly items: readonly T[];
  readonly completeness: import('./types').TuiDebugAutomationCollectionCompleteness;
} {
  const droppedCount = Math.max(0, items.length - limit);
  return {
    items: droppedCount > 0 ? items.slice(droppedCount) : [...items],
    completeness: { limit, droppedCount },
  };
}

function readArtifactFacts(
  stores: TuiConversationStores,
  tasks: readonly Task[],
  generatedOutputLifecycles: readonly GeneratedAssetRevisionRef[],
  creatorVisibleArtifacts: readonly CreatorVisibleArtifactCandidate[],
): TuiDebugAutomationSessionFacts['artifacts'] {
  const facts = [
    ...stores.conversation
      .getState()
      .messages.flatMap((message) =>
        (message.timelineRows ?? []).flatMap((row) => row.artifactFacts ?? []),
      ),
    ...projectTaskOutputArtifactFacts(tasks),
    ...projectGeneratedOutputLifecycleArtifactFacts(generatedOutputLifecycles),
    ...projectCreatorVisibleArtifactFacts(creatorVisibleArtifacts),
  ];
  const unique = new Map<string, (typeof facts)[number]>();
  for (const fact of facts)
    unique.set(`${fact.ref}:${fact.digest ?? ''}:${fact.revision ?? ''}`, fact);
  return [...unique.values()];
}

function messageContainsCanvasSignal(message: Message): boolean {
  return (
    /canvas/i.test(message.content) ||
    message.toolCalls.some((toolCall) => safeJsonIncludesCanvas(toolCall)) ||
    (message.timelineRows ?? []).some((row) => safeJsonIncludesCanvas(row))
  );
}

function projectToolCallSummary(
  toolCall: Message['toolCalls'][number],
): TuiDebugAutomationToolCallSummary {
  return {
    id: toolCall.id,
    name: toolCall.name,
    status: toolCall.status,
    ...(toolCall.arguments ? { arguments: toolCall.arguments } : {}),
    ...(toolCall.result !== undefined ? { result: toolCall.result } : {}),
    ...(toolCall.error ? { error: toolCall.error } : {}),
    resultObservation: toolCall.error
      ? 'error'
      : toolCall.result !== undefined
        ? 'available'
        : toolCall.status === 'pending' || toolCall.status === 'running'
          ? 'pending'
          : 'missing',
    diagnostics: toolCall.error
      ? [{ code: 'tool-call-error', severity: 'error', message: toolCall.error }]
      : [],
  };
}

function safeJsonIncludesCanvas(value: unknown): boolean {
  try {
    return /canvas/i.test(JSON.stringify(value));
  } catch {
    return false;
  }
}

/**
 * Agent execution trace contracts.
 *
 * Trace data is carried in structured logger payloads and runtime metadata.
 * It is intentionally not part of the generic LogEntry shape.
 */

export type AgentTracePhase =
  | 'session'
  | 'think'
  | 'act'
  | 'observe'
  | 'hook'
  | 'llm'
  | 'tool'
  | 'compaction'
  | 'workflow'
  | 'creation'
  | 'approval'
  | 'validation'
  | 'subagent';

export interface AgentTraceContext {
  readonly conversationId: string;
  readonly runId?: string;
  readonly turnId?: string;
  readonly iteration?: number;
  readonly phase?: AgentTracePhase;
  readonly parentRequestId?: string;
  readonly llmRequestId?: string;
  readonly toolRequestId?: string;
}

export interface CreateAgentTraceContextInput {
  readonly conversationId?: string | null;
  readonly runId?: string | null;
  readonly turnId?: string | null;
  readonly iteration?: number | null;
  readonly phase?: AgentTracePhase | null;
  readonly parentRequestId?: string | null;
  readonly llmRequestId?: string | null;
  readonly toolRequestId?: string | null;
}

export type AgentTracePatch = Omit<CreateAgentTraceContextInput, 'conversationId'> & {
  readonly conversationId?: string | null;
};

export const UNKNOWN_AGENT_TRACE_ID = 'unknown';

export function createAgentTurnId(conversationId: string, startedAt = Date.now()): string {
  return `turn-${normalizeTraceId(conversationId)}-${startedAt.toString(36)}`;
}

export function createAgentRunId(conversationId: string, startedAt = Date.now()): string {
  return `run-${normalizeTraceId(conversationId)}-${startedAt.toString(36)}`;
}

export function createAgentTraceContext(
  input: CreateAgentTraceContextInput = {},
): AgentTraceContext {
  const conversationId = normalizeTraceId(input.conversationId ?? UNKNOWN_AGENT_TRACE_ID);
  return buildAgentTraceContext({
    conversationId,
    runId: normalizeOptionalTraceId(input.runId),
    turnId: normalizeOptionalTraceId(input.turnId),
    iteration: normalizeIteration(input.iteration),
    phase: input.phase ?? undefined,
    parentRequestId: normalizeOptionalTraceId(input.parentRequestId),
    llmRequestId: normalizeOptionalTraceId(input.llmRequestId),
    toolRequestId: normalizeOptionalTraceId(input.toolRequestId),
  });
}

export function deriveAgentTraceContext(
  parent: AgentTraceContext | undefined,
  patch: AgentTracePatch = {},
): AgentTraceContext {
  const base = parent ?? createAgentTraceContext();
  return buildAgentTraceContext({
    conversationId:
      patch.conversationId !== undefined && patch.conversationId !== null
        ? normalizeTraceId(patch.conversationId)
        : base.conversationId,
    runId: patch.runId !== undefined ? normalizeOptionalTraceId(patch.runId) : base.runId,
    turnId: patch.turnId !== undefined ? normalizeOptionalTraceId(patch.turnId) : base.turnId,
    iteration: patch.iteration !== undefined ? normalizeIteration(patch.iteration) : base.iteration,
    phase: patch.phase !== undefined ? (patch.phase ?? undefined) : base.phase,
    parentRequestId:
      patch.parentRequestId !== undefined
        ? normalizeOptionalTraceId(patch.parentRequestId)
        : base.parentRequestId,
    llmRequestId:
      patch.llmRequestId !== undefined
        ? normalizeOptionalTraceId(patch.llmRequestId)
        : base.llmRequestId,
    toolRequestId:
      patch.toolRequestId !== undefined
        ? normalizeOptionalTraceId(patch.toolRequestId)
        : base.toolRequestId,
  });
}

export function withAgentTrace(
  trace: AgentTraceContext | undefined,
  data: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...data,
    trace: trace ?? createAgentTraceContext(),
  };
}

function buildAgentTraceContext(input: {
  readonly conversationId: string;
  readonly runId?: string;
  readonly turnId?: string;
  readonly iteration?: number;
  readonly phase?: AgentTracePhase;
  readonly parentRequestId?: string;
  readonly llmRequestId?: string;
  readonly toolRequestId?: string;
}): AgentTraceContext {
  return {
    conversationId: input.conversationId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.iteration !== undefined ? { iteration: input.iteration } : {}),
    ...(input.phase ? { phase: input.phase } : {}),
    ...(input.parentRequestId ? { parentRequestId: input.parentRequestId } : {}),
    ...(input.llmRequestId ? { llmRequestId: input.llmRequestId } : {}),
    ...(input.toolRequestId ? { toolRequestId: input.toolRequestId } : {}),
  };
}

function normalizeTraceId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_AGENT_TRACE_ID;
}

function normalizeOptionalTraceId(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeIteration(value: number | null | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

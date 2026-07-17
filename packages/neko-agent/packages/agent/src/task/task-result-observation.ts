import type {
  AgentObservation,
  AgentObservationModality,
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultFollowUpRequest,
  AgentTaskResultObservation,
  AgentTaskResultRef,
  AgentTaskResultRefKind,
  AgentTaskResultSource,
  AgentTaskResultTerminalStatus,
  ChildRunScope,
  EvidenceSource,
  PerceptionEvidence,
  Task,
  TaskRunScope,
  TaskStatus,
} from '@neko/shared';
import { isResourceRef, validateChildRunScope } from '@neko/shared';

export type AgentTaskResultObservationDiagnosticCode =
  | 'task-not-terminal'
  | 'invalid-owner-scope'
  | 'owner-scope-mismatch'
  | 'malformed-result-ref'
  | 'unsafe-result-ref'
  | 'invalid-delivery-policy';

export class AgentTaskResultObservationError extends Error {
  constructor(
    readonly code: AgentTaskResultObservationDiagnosticCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AgentTaskResultObservationError';
  }
}

export interface NormalizeAgentTaskResultObservationInput {
  readonly task: Task;
  readonly source: AgentTaskResultSource;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly scope?: TaskRunScope;
  readonly resultRefs?: readonly AgentTaskResultRef[];
  readonly now?: number;
}

export interface NormalizeAgentChildRunResultObservationInput {
  readonly scope: ChildRunScope;
  readonly childId: string;
  readonly childType: string;
  readonly status: AgentTaskResultTerminalStatus;
  readonly source: AgentTaskResultSource;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly outputData?: unknown;
  readonly error?: string;
  readonly resultRefs?: readonly AgentTaskResultRef[];
  readonly createdAt: number;
  readonly completedAt: number;
  readonly runStartedAt?: number;
}

export interface AgentTaskResultObservationRecords {
  readonly observation: AgentObservation;
  readonly evidence: PerceptionEvidence;
}

export type AgentTaskResultDeliveryDecision =
  | {
      readonly kind: 'notify-only' | 'append-observation';
    }
  | {
      readonly kind: 'ask-user-to-continue' | 'auto-resume-agent';
      readonly followUpRequest: AgentTaskResultFollowUpRequest;
    };

export const DEFAULT_AGENT_TASK_RESULT_DELIVERY_POLICY: AgentTaskResultDeliveryPolicy = {
  kind: 'append-observation',
};

export function normalizeAgentTaskResultObservation(
  input: NormalizeAgentTaskResultObservationInput,
): AgentTaskResultObservation {
  const task = input.task;
  assertTerminalTaskStatus(task.status, task.id);

  const taskScope = requireTaskOwnerScope(task);
  assertTaskRunScopeMatches(taskScope, task.id, input.scope);

  const outputData = task.output?.data;
  const resultRefs = normalizeAgentTaskResultRefs([
    ...(input.resultRefs ?? []),
    ...extractAgentTaskResultRefs(outputData),
  ]);
  const status = task.status;
  const error = task.error ?? task.output?.error;

  return {
    id: createAgentTaskResultObservationId(
      taskScope.conversationId,
      taskScope.runId,
      task.id,
      status,
    ),
    conversationId: taskScope.conversationId,
    runId: taskScope.runId,
    ...(typeof task.lifecycle?.ownerRunStartedAt === 'number'
      ? { runStartedAt: task.lifecycle.ownerRunStartedAt }
      : {}),
    taskId: task.id,
    source: input.source,
    taskType: task.type,
    status,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    ...(input.parentToolCallId ? { parentToolCallId: input.parentToolCallId } : {}),
    summary: buildAgentTaskResultSummary(task, resultRefs),
    ...(resultRefs.length > 0 ? { resultRefs } : {}),
    ...(error ? { error } : {}),
    createdAt: task.createdAt,
    completedAt: task.updatedAt || input.now || Date.now(),
  };
}

export function normalizeAgentChildRunResultObservation(
  input: NormalizeAgentChildRunResultObservationInput,
): AgentTaskResultObservation {
  if (input.scope.childRunId !== input.childId) {
    throw new AgentTaskResultObservationError(
      'owner-scope-mismatch',
      `Child run scope ${input.scope.childRunId} cannot authorize result ${input.childId}`,
      { scope: input.scope, childId: input.childId },
    );
  }
  assertTerminalTaskStatus(input.status, input.childId);
  const resultRefs = normalizeAgentTaskResultRefs([
    ...(input.resultRefs ?? []),
    ...extractAgentTaskResultRefs(input.outputData),
  ]);

  return {
    id: createAgentTaskResultObservationId(
      input.scope.conversationId,
      input.scope.runId,
      input.childId,
      input.status,
    ),
    conversationId: input.scope.conversationId,
    runId: input.scope.runId,
    ...(input.runStartedAt !== undefined ? { runStartedAt: input.runStartedAt } : {}),
    taskId: input.childId,
    source: input.source,
    taskType: input.childType,
    status: input.status,
    ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
    ...(input.parentToolCallId ? { parentToolCallId: input.parentToolCallId } : {}),
    summary: buildAgentChildRunResultSummary(
      input.childId,
      input.childType,
      input.status,
      input.error,
      resultRefs,
    ),
    ...(resultRefs.length > 0 ? { resultRefs } : {}),
    ...(input.error ? { error: input.error } : {}),
    createdAt: input.createdAt,
    completedAt: input.completedAt,
  };
}

export function createAgentTaskResultObservationRecords(input: {
  readonly observation: AgentTaskResultObservation;
  readonly outputData?: unknown;
  readonly now?: number;
}): AgentTaskResultObservationRecords {
  const createdAt = input.now ?? input.observation.completedAt;
  const evidenceId = createAgentTaskResultEvidenceId(input.observation, input.outputData);
  const observation: AgentObservation = {
    id: input.observation.id,
    modality: inferAgentTaskResultModality(input.observation),
    summary: input.observation.summary,
    confidence: input.observation.status === 'completed' ? 'high' : 'low',
    evidenceIds: [evidenceId],
    ...(input.observation.error ? { issues: [input.observation.error] } : {}),
    createdAt,
    status: 'active',
  };
  const evidence: PerceptionEvidence = {
    id: evidenceId,
    source: toEvidenceSource(input.observation.source),
    summary: input.observation.summary,
    confidence: input.observation.status === 'completed' ? 0.9 : 0.35,
    observationId: input.observation.id,
    data: {
      taskResultObservation: input.observation,
      ...(input.outputData !== undefined ? { outputData: input.outputData } : {}),
    },
    createdAt,
    status: 'active',
  };

  return { observation, evidence };
}

export function evaluateAgentTaskResultDelivery(input: {
  readonly observation: AgentTaskResultObservation;
  readonly policy?: AgentTaskResultDeliveryPolicy;
  readonly now?: number;
}): AgentTaskResultDeliveryDecision {
  const policy = normalizeAgentTaskResultDeliveryPolicy(input.policy);
  if (policy.kind === 'notify-only' || policy.kind === 'append-observation') {
    return { kind: policy.kind };
  }

  const prompt =
    policy.prompt?.trim() ||
    buildDefaultAgentTaskResultFollowUpPrompt(input.observation, policy.kind);
  return {
    kind: policy.kind,
    followUpRequest: {
      id: createAgentTaskResultFollowUpRequestId(input.observation, policy.kind),
      conversationId: input.observation.conversationId,
      runId: input.observation.runId,
      observationId: input.observation.id,
      taskId: input.observation.taskId,
      policy: { ...policy, prompt },
      prompt,
      createdAt: input.now ?? Date.now(),
    },
  };
}

export function getAgentTaskResultDeliveryPolicy(
  task: Pick<Task, 'lifecycle'>,
): AgentTaskResultDeliveryPolicy {
  return task.lifecycle?.resultDeliveryPolicy ?? DEFAULT_AGENT_TASK_RESULT_DELIVERY_POLICY;
}

export function normalizeAgentTaskResultDeliveryPolicy(
  policy: AgentTaskResultDeliveryPolicy | undefined,
): AgentTaskResultDeliveryPolicy {
  const next = policy ?? DEFAULT_AGENT_TASK_RESULT_DELIVERY_POLICY;
  if (
    next.kind === 'notify-only' ||
    next.kind === 'append-observation' ||
    next.kind === 'ask-user-to-continue' ||
    next.kind === 'auto-resume-agent'
  ) {
    return next;
  }

  throw new AgentTaskResultObservationError(
    'invalid-delivery-policy',
    'Unknown Agent task result delivery policy',
    { policy: next },
  );
}

export function normalizeAgentTaskResultRefs(
  refs: readonly AgentTaskResultRef[],
): readonly AgentTaskResultRef[] {
  const normalized: AgentTaskResultRef[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const next = normalizeAgentTaskResultRef(ref);
    const key = `${next.kind}:${next.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(next);
  }

  return normalized;
}

export function createAgentTaskResultObservationId(
  conversationId: string,
  runId: string,
  taskId: string,
  status: AgentTaskResultTerminalStatus,
): string {
  return `task-result-observation:${stableHash({ conversationId, runId, taskId, status })}`;
}

export function createAgentTaskResultEvidenceId(
  observation: AgentTaskResultObservation,
  outputData: unknown,
): string {
  return `task-result-evidence:${stableHash({
    observationId: observation.id,
    resultRefs: observation.resultRefs ?? [],
    outputData: outputData ?? null,
    error: observation.error ?? null,
  })}`;
}

export function createAgentTaskResultFollowUpRequestId(
  observation: AgentTaskResultObservation,
  policyKind: 'ask-user-to-continue' | 'auto-resume-agent',
): string {
  return `task-result-followup:${stableHash({
    observationId: observation.id,
    policyKind,
  })}`;
}

export function isAgentTaskResultTerminalStatus(
  status: TaskStatus,
): status is AgentTaskResultTerminalStatus {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function assertTerminalTaskStatus(
  status: TaskStatus,
  taskId: string,
): asserts status is AgentTaskResultTerminalStatus {
  if (isAgentTaskResultTerminalStatus(status)) {
    return;
  }

  throw new AgentTaskResultObservationError('task-not-terminal', `Task ${taskId} is not terminal`, {
    taskId,
    status,
  });
}

function requireTaskOwnerScope(task: Task): TaskRunScope {
  const scopeResult = validateChildRunScope(task.scope);
  if (!scopeResult.ok) {
    throw new AgentTaskResultObservationError(
      'invalid-owner-scope',
      `Task ${task.id} does not have a valid owner scope`,
      { taskId: task.id, diagnostic: scopeResult.diagnostic },
    );
  }
  if (scopeResult.scope.childKind !== 'task' || scopeResult.scope.childRunId !== task.id) {
    throw new AgentTaskResultObservationError(
      'owner-scope-mismatch',
      `Task ${task.id} does not match its owner scope`,
      { taskId: task.id, taskScope: scopeResult.scope },
    );
  }
  return task.scope;
}

function assertTaskRunScopeMatches(
  taskScope: TaskRunScope,
  taskId: string,
  eventScope: TaskRunScope | undefined,
): void {
  if (!eventScope) {
    return;
  }
  if (
    taskScope.conversationId === eventScope.conversationId &&
    taskScope.runId === eventScope.runId &&
    taskScope.parentRunId === eventScope.parentRunId &&
    taskScope.childRunId === eventScope.childRunId &&
    taskScope.childKind === eventScope.childKind
  ) {
    return;
  }

  throw new AgentTaskResultObservationError(
    'owner-scope-mismatch',
    `Task ${taskId} terminal event scope does not match the task owner scope`,
    { taskId, taskScope, eventScope },
  );
}

function normalizeAgentTaskResultRef(ref: AgentTaskResultRef): AgentTaskResultRef {
  if (!isAgentTaskResultRefKind(ref.kind)) {
    throw new AgentTaskResultObservationError(
      'malformed-result-ref',
      'Task result ref has an unknown kind',
      { ref },
    );
  }
  const id = ref.id.trim();
  if (!id) {
    throw new AgentTaskResultObservationError(
      'malformed-result-ref',
      'Task result ref id cannot be empty',
      { ref },
    );
  }
  assertSafeTaskResultRefId(ref.kind, id);
  return {
    kind: ref.kind,
    id,
    ...(ref.mimeType?.trim() ? { mimeType: ref.mimeType.trim() } : {}),
    ...(ref.label?.trim() ? { label: ref.label.trim() } : {}),
    ...(ref.kind === 'resource' && isResourceRef(ref.resourceRef)
      ? { resourceRef: ref.resourceRef }
      : {}),
  };
}

function extractAgentTaskResultRefs(value: unknown): readonly AgentTaskResultRef[] {
  if (!isRecord(value)) {
    return [];
  }

  const refs: AgentTaskResultRef[] = [];
  refs.push(...readRefArray(value['resultRefs']));
  refs.push(...readUrlRefs(value['url']));
  refs.push(...readUrlRefs(value['urls']));
  refs.push(...readUrlRefs(value['resultUrl']));
  refs.push(...readUrlRefs(value['resultUrls']));
  refs.push(...readIdRefs('artifact', value['artifactId']));
  refs.push(...readIdRefs('artifact', value['artifactIds']));
  refs.push(...readIdRefs('asset', value['assetId']));
  refs.push(...readIdRefs('asset', value['assetIds']));
  refs.push(...readPresentationResourceRefs(value['assets']));
  refs.push(...readIdRefs('resource', value['resourceId']));
  refs.push(...readIdRefs('resource', value['resourceIds']));
  refs.push(...readIdRefs('resource', value['contentId']));
  refs.push(...readIdRefs('resource', value['contentIds']));
  return refs;
}

function readRefArray(value: unknown): AgentTaskResultRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new AgentTaskResultObservationError(
        'malformed-result-ref',
        'Task result ref must be an object',
        { ref: item },
      );
    }
    return {
      kind: readRequiredString(item, 'kind') as AgentTaskResultRefKind,
      id: readRequiredString(item, 'id'),
      ...(typeof item['mimeType'] === 'string' ? { mimeType: item['mimeType'] } : {}),
      ...(typeof item['label'] === 'string' ? { label: item['label'] } : {}),
      ...(isResourceRef(item['resourceRef']) ? { resourceRef: item['resourceRef'] } : {}),
    };
  });
}

function readUrlRefs(value: unknown): AgentTaskResultRef[] {
  return readStringList(value).map((id) => ({ kind: 'url', id }));
}

function readIdRefs(kind: AgentTaskResultRefKind, value: unknown): AgentTaskResultRef[] {
  return readStringList(value).map((id) => ({ kind, id }));
}

function readPresentationResourceRefs(value: unknown): AgentTaskResultRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const refs: AgentTaskResultRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (isResourceRef(entry['resourceRef'])) {
      refs.push({
        kind: 'resource',
        id: entry['resourceRef'].id,
        ...(typeof entry['mimeType'] === 'string' ? { mimeType: entry['mimeType'] } : {}),
        ...(typeof entry['label'] === 'string' ? { label: entry['label'] } : {}),
        resourceRef: entry['resourceRef'],
      });
    }
  }
  return refs;
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const raw = value[key];
  if (typeof raw !== 'string') {
    throw new AgentTaskResultObservationError(
      'malformed-result-ref',
      `Task result ref ${key} must be a string`,
      { ref: value },
    );
  }
  return raw;
}

function readStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function isAgentTaskResultRefKind(value: string): value is AgentTaskResultRefKind {
  return value === 'resource' || value === 'artifact' || value === 'asset' || value === 'url';
}

function assertSafeTaskResultRefId(kind: AgentTaskResultRefKind, id: string): void {
  if (kind === 'url') {
    assertSafeTaskResultUrl(id);
    return;
  }
  if (looksLikeLocalPathOrDisplayUri(id)) {
    throw new AgentTaskResultObservationError(
      'unsafe-result-ref',
      'Task result ref id must be a stable handle, not a local/display path',
      { kind, id },
    );
  }
}

function assertSafeTaskResultUrl(id: string): void {
  let url: URL;
  try {
    url = new URL(id);
  } catch {
    throw new AgentTaskResultObservationError(
      'unsafe-result-ref',
      'Task result URL must be an absolute http(s) URL',
      { id },
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AgentTaskResultObservationError(
      'unsafe-result-ref',
      'Task result URL must use http(s)',
      { id, protocol: url.protocol },
    );
  }
}

function looksLikeLocalPathOrDisplayUri(value: string): boolean {
  return (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('file:') ||
    value.startsWith('vscode-resource:') ||
    value.startsWith('vscode-webview-resource:') ||
    value.startsWith('data:')
  );
}

function buildAgentChildRunResultSummary(
  childId: string,
  childType: string,
  status: AgentTaskResultTerminalStatus,
  error: string | undefined,
  refs: readonly AgentTaskResultRef[],
): string {
  if (status === 'completed') {
    const suffix =
      refs.length > 0
        ? ` with ${refs.length} stable result reference${refs.length === 1 ? '' : 's'}`
        : '';
    return `Task ${childId} (${childType}) completed${suffix}.`;
  }
  if (status === 'failed') {
    return `Task ${childId} (${childType}) failed${error ? `: ${error}` : '.'}`;
  }
  return `Task ${childId} (${childType}) was cancelled.`;
}

function buildAgentTaskResultSummary(
  task: Pick<Task, 'id' | 'type' | 'status' | 'error' | 'output'>,
  refs: readonly AgentTaskResultRef[],
): string {
  if (task.status === 'completed') {
    const suffix =
      refs.length > 0
        ? ` with ${refs.length} stable result reference${refs.length === 1 ? '' : 's'}`
        : '';
    return `Task ${task.id} (${task.type}) completed${suffix}.`;
  }
  if (task.status === 'failed') {
    const error = task.error ?? task.output?.error;
    return `Task ${task.id} (${task.type}) failed${error ? `: ${error}` : '.'}`;
  }
  return `Task ${task.id} (${task.type}) was cancelled.`;
}

function inferAgentTaskResultModality(
  observation: AgentTaskResultObservation,
): AgentObservationModality {
  const modalities = new Set<AgentObservationModality>();
  if (observation.taskType === 'image_generation') modalities.add('image');
  if (observation.taskType === 'video_generation') modalities.add('video');
  if (observation.taskType === 'audio_generation') modalities.add('audio');
  for (const ref of observation.resultRefs ?? []) {
    if (ref.mimeType?.startsWith('image/')) modalities.add('image');
    if (ref.mimeType?.startsWith('video/')) modalities.add('video');
    if (ref.mimeType?.startsWith('audio/')) modalities.add('audio');
  }
  if (modalities.size > 1) return 'mixed';
  return modalities.values().next().value ?? 'data';
}

function toEvidenceSource(source: AgentTaskResultSource): EvidenceSource {
  if (source === 'subagent') return 'subagent';
  if (source === 'media-task') return 'engine';
  return 'tool';
}

function buildDefaultAgentTaskResultFollowUpPrompt(
  observation: AgentTaskResultObservation,
  policyKind: 'ask-user-to-continue' | 'auto-resume-agent',
): string {
  const prefix =
    policyKind === 'auto-resume-agent'
      ? 'Continue from the completed async task result.'
      : 'Review the completed async task result before continuing.';
  const lines = [prefix, '', `Observation: ${observation.summary}`, `Task: ${observation.taskId}`];
  const resultRefs = formatAgentTaskResultRefs(observation.resultRefs ?? []);
  if (resultRefs.length > 0) {
    lines.push('', 'Stable result references:', ...resultRefs);
  }

  const readImageInputs = formatReadImageInputs(observation.resultRefs ?? []);
  if (readImageInputs.length > 0) {
    lines.push(
      '',
      'Generated image inputs for ReadImage:',
      ...readImageInputs,
      'For visual analysis, call ReadImage with images[] entries copied from these resourceRef objects. Do not use the task id, assetRef URI, or local path as a resourceRef.',
    );
  }

  return lines.join('\n');
}

function formatAgentTaskResultRefs(refs: readonly AgentTaskResultRef[]): string[] {
  return refs.slice(0, 8).map((ref) => {
    const details = [
      ref.mimeType ? `mimeType=${ref.mimeType}` : undefined,
      ref.label ? `label=${ref.label}` : undefined,
    ].filter((detail): detail is string => detail !== undefined);
    return `- ${ref.kind}: ${ref.id}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
  });
}

function formatReadImageInputs(refs: readonly AgentTaskResultRef[]): string[] {
  return refs
    .filter(
      (ref) =>
        ref.kind === 'resource' &&
        isResourceRef(ref.resourceRef) &&
        ref.mimeType?.startsWith('image/'),
    )
    .slice(0, 4)
    .map((ref, index) => {
      const imageInput = {
        ...(ref.label ? { label: ref.label } : {}),
        ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
        resourceRef: ref.resourceRef,
      };
      return `- images[${index}]: ${JSON.stringify(imageInput)}`;
    });
}

function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { createHash } from 'node:crypto';
import { readRequiredString, sendDebugRequest } from './debug-protocol-client.mjs';

const FEEDBACK_PLACEHOLDER = '${lastAssistant}';

export async function runTuiWorkflowController(child, responses, input) {
  let sessionId;
  let conversationId;
  let latestFacts;
  let primaryError;
  const trace = {
    schema: 'neko.agent-eval.workflow-trace.v1',
    sessions: [],
    steps: [],
  };

  const startSession = async (method, params, stepId) => {
    const started = await sendDebugRequest(child, responses, {
      id: requestId(stepId, method),
      method,
      params,
    });
    sessionId = readRequiredString(started, 'sessionId');
    conversationId = readRequiredString(started, 'conversationId');
    trace.sessions.push({ method, sessionId, conversationId, ...(stepId ? { stepId } : {}) });
  };

  const ensureSession = async () => {
    if (sessionId !== undefined) return;
    await startSession('session.create', input.sessionParams ?? {}, undefined);
  };

  const readFacts = async (stepId) => {
    if (sessionId === undefined) throw workflowError('session-not-ready', 'No active TUI session');
    const facts = await sendDebugRequest(child, responses, {
      id: requestId(stepId, 'session.facts'),
      method: 'session.facts',
      params: { sessionId, includeHistory: input.includeHistory === true },
    });
    latestFacts = facts;
    return facts;
  };

  const disposeActiveSession = async (stepId) => {
    if (sessionId === undefined) return;
    const disposedSessionId = sessionId;
    await sendDebugRequest(child, responses, {
      id: requestId(stepId, 'session.dispose'),
      method: 'session.dispose',
      params: { sessionId: disposedSessionId },
    });
    sessionId = undefined;
  };

  try {
    for (const step of input.steps) {
      if (step.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, step.delayMs));
      }
      if (step.kind === 'resume') {
        const resumedConversationId = resolveConversationRef(
          step.conversationRef,
          conversationId,
          input.conversationRefs,
        );
        await disposeActiveSession(step.id);
        await startSession(
          'session.resume',
          { ...(input.sessionParams ?? {}), conversationId: resumedConversationId },
          step.id,
        );
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'session.resume',
          conversationRef: step.conversationRef,
          sessionId,
          conversationId,
        });
        continue;
      }

      await ensureSession();
      if (step.kind === 'submit' || step.kind === 'queue') {
        const submitted = await submitPrompt(child, responses, sessionId, step.id, step.prompt);
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'message.submit',
          afterStepId: step.afterStepId,
          queued: submitted?.queued === true,
          promptDigest: digest(step.prompt),
          ...(input.captureStepFacts === false
            ? {}
            : { snapshot: projectSnapshot(await readFacts(step.id)) }),
        });
        continue;
      }

      if (step.kind === 'feedback') {
        const sourceFacts = await readFacts(step.id);
        const sourceTurn = readLastAssistantTurn(sourceFacts);
        const prompt = step.prompt.replace(FEEDBACK_PLACEHOLDER, sourceTurn.content);
        const submitted = await submitPrompt(child, responses, sessionId, step.id, prompt);
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'message.submit',
          afterStepId: step.afterStepId,
          queued: submitted?.queued === true,
          promptDigest: digest(prompt),
          feedbackSource: { turnId: sourceTurn.id, digest: digest(sourceTurn.content) },
          ...(input.captureStepFacts === false
            ? {}
            : { snapshot: projectSnapshot(await readFacts(step.id)) }),
        });
        continue;
      }

      if (step.kind === 'cancel') {
        const cancellation = await sendDebugRequest(child, responses, {
          id: requestId(step.id, 'message.cancel'),
          method: 'message.cancel',
          params: { sessionId },
        });
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'message.cancel',
          afterStepId: step.afterStepId,
          accepted: cancellation?.accepted === true,
          ...(input.captureStepFacts === false
            ? {}
            : { snapshot: projectSnapshot(await readFacts(step.id)) }),
        });
        continue;
      }

      if (step.kind === 'confirm') {
        const confirmation = await sendDebugRequest(child, responses, {
          id: requestId(step.id, 'tool.confirm'),
          method: 'tool.confirm',
          params: {
            sessionId,
            toolName: step.toolName,
            approved: step.approved,
            timeoutMs: step.timeoutMs,
          },
        });
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'tool.confirm',
          afterStepId: step.afterStepId,
          toolName: confirmation?.toolName ?? step.toolName,
          toolCallId: confirmation?.toolCallId,
          approved: confirmation?.approved === true,
          ...(input.captureStepFacts === false
            ? {}
            : { snapshot: projectSnapshot(await readFacts(step.id)) }),
        });
        continue;
      }

      if (step.kind === 'wait-for-idle') {
        const idle = await sendDebugRequest(child, responses, {
          id: requestId(step.id, 'session.waitForIdle'),
          method: 'session.waitForIdle',
          params: { sessionId, timeoutMs: step.timeoutMs },
        });
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'session.waitForIdle',
          fullyIdle: idle?.fullyIdle === true,
          ...(input.captureStepFacts === false
            ? {}
            : { snapshot: projectSnapshot(await readFacts(step.id)) }),
        });
        continue;
      }

      if (step.kind === 'resize') {
        const resized = await sendDebugRequest(child, responses, {
          id: requestId(step.id, 'terminal.resize'),
          method: 'terminal.resize',
          params: { sessionId, columns: step.columns, rows: step.rows },
        });
        await new Promise((resolve) => setTimeout(resolve, input.resizeSettleMs ?? 50));
        latestFacts = undefined;
        trace.steps.push({
          id: step.id,
          kind: step.kind,
          method: 'terminal.resize',
          columns: resized?.columns ?? step.columns,
          rows: resized?.rows ?? step.rows,
          ...(input.captureStepFacts === false
            ? {}
            : { snapshot: projectSnapshot(await readFacts(step.id)) }),
        });
        continue;
      }

      throw workflowError('configuration-invalid', `Unsupported workflow step: ${step.kind}`);
    }

    await ensureSession();
    for (const [index, resize] of (input.terminalResizes ?? []).entries()) {
      await sendDebugRequest(child, responses, {
        id: `resize-${index + 1}:terminal.resize`,
        method: 'terminal.resize',
        params: { sessionId, columns: resize.columns, rows: resize.rows },
      });
      await new Promise((resolve) => setTimeout(resolve, input.resizeSettleMs ?? 50));
      latestFacts = undefined;
    }
    const facts = latestFacts ?? (await readFacts('final'));
    return input.includeTrace === false ? facts : { ...facts, automation: toJsonValue(trace) };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError;
    try {
      await disposeActiveSession('final');
    } catch (error) {
      cleanupError = error;
    }
    child.stdin.end();
    child.kill();
    if (primaryError === undefined && cleanupError !== undefined) throw cleanupError;
  }
}

async function submitPrompt(child, responses, sessionId, stepId, prompt) {
  return sendDebugRequest(child, responses, {
    id: requestId(stepId, 'message.submit'),
    method: 'message.submit',
    params: { sessionId, prompt },
  });
}

function resolveConversationRef(ref, currentConversationId, conversationRefs = {}) {
  if (ref === 'current') {
    if (currentConversationId) return currentConversationId;
    throw workflowError(
      'configuration-invalid',
      'resume conversationRef current requires an existing workflow session',
    );
  }
  const resolved = conversationRefs[ref];
  if (typeof resolved !== 'string' || resolved.length === 0) {
    throw workflowError('configuration-invalid', `Unknown resume conversationRef: ${ref}`);
  }
  return resolved;
}

function readLastAssistantTurn(facts) {
  const completeness = facts?.evidenceCompleteness?.turns;
  if (!completeness || completeness.droppedCount !== 0) {
    throw workflowError(
      'incomplete-evidence',
      'Closed-loop feedback requires complete turn evidence',
    );
  }
  const turn = (Array.isArray(facts?.turns) ? facts.turns : [])
    .filter((candidate) => candidate?.role === 'assistant' && candidate?.isError !== true)
    .at(-1);
  if (!turn || typeof turn.content !== 'string' || turn.content.trim().length === 0) {
    throw workflowError(
      'feedback-source-missing',
      'Closed-loop feedback requires a non-empty assistant output',
    );
  }
  return turn;
}

function projectSnapshot(facts) {
  return {
    conversationId: facts?.conversationId,
    idle: facts?.idle,
    messageQueue: projectQueueSnapshot(facts?.messageQueue),
    turns: (Array.isArray(facts?.turns) ? facts.turns : []).map((turn) => ({
      id: turn?.id,
      role: turn?.role,
      source: turn?.source,
      isError: turn?.isError === true,
      toolCalls: (Array.isArray(turn?.toolCalls) ? turn.toolCalls : []).map((call) => ({
        id: call?.id,
        name: call?.name,
        status: call?.status,
        resultObservation: call?.resultObservation,
      })),
      timeline: (Array.isArray(turn?.timeline) ? turn.timeline : []).map((event) => ({
        id: event?.id,
        sequence: event?.sequence,
        kind: event?.kind,
        status: event?.status,
        toolCallId: event?.toolCallId,
        toolName: event?.toolName,
        content: event?.content,
      })),
    })),
    tasks: Array.isArray(facts?.tasks) ? facts.tasks : [],
    continuations: Array.isArray(facts?.continuations) ? facts.continuations : [],
    workspaceBoardProjections: Array.isArray(facts?.workspaceBoardProjections)
      ? facts.workspaceBoardProjections
      : [],
    workspaceBoardDelivery: facts?.workspaceBoardDelivery,
    retries: facts?.retries,
    runtimeErrors: facts?.runtimeErrors,
    evidenceCompleteness: facts?.evidenceCompleteness,
  };
}

function projectQueueSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    conversationId: snapshot.conversationId,
    version: snapshot.version,
    pendingCount: snapshot.pendingCount,
    pausedAfterCancel: snapshot.pausedAfterCancel,
    items: (Array.isArray(snapshot.items) ? snapshot.items : []).map((item) => ({
      id: item?.id,
      source: item?.source,
      displayKind: item?.displayKind,
      status: item?.metadata?.status,
    })),
  };
}

function requestId(stepId, method) {
  return `${stepId ?? 'create'}:${method}`;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function workflowError(code, message) {
  return Object.assign(new Error(message), { code });
}

function toJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

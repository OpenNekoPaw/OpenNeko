import { evaluateStructuredOutput } from './structured-output.mjs';

export const EVALUATION_OUTCOMES = Object.freeze({
  pass: 'pass',
  caseFail: 'case-fail',
  infrastructureFail: 'infrastructure-fail',
  configurationInvalid: 'configuration-invalid',
  nonComparable: 'non-comparable',
});

export function evaluateHardGates(assertions, facts, context = {}) {
  return assertions.map((assertion) => evaluateGate(assertion, facts, context));
}

export function classifyEvaluation(input) {
  if (input.phase === 'configuration') {
    return classification(EVALUATION_OUTCOMES.configurationInvalid, input.error);
  }
  if (input.phase === 'setup' || input.phase === 'execution' || input.phase === 'report') {
    return classification(EVALUATION_OUTCOMES.infrastructureFail, input.error);
  }
  if (input.phase === 'assertion') {
    return classification(EVALUATION_OUTCOMES.caseFail, input.error);
  }
  if (input.hardGates?.some((gate) => gate.status !== 'pass')) {
    return classification(EVALUATION_OUTCOMES.caseFail);
  }
  return classification(EVALUATION_OUTCOMES.pass);
}

function evaluateGate(assertion, facts, context) {
  try {
    const details = runGate(assertion, facts, context);
    return {
      id: assertion.id,
      kind: assertion.kind,
      status: 'pass',
      evidenceRefs: [assertion.evidenceRef],
      details,
    };
  } catch (error) {
    return {
      id: assertion.id,
      kind: assertion.kind,
      status: 'fail',
      evidenceRefs: [assertion.evidenceRef],
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function runGate(assertion, facts, context) {
  switch (assertion.kind) {
    case 'runtime-errors-empty':
      return assertRuntimeErrorsEmpty(facts);
    case 'fully-idle':
      return assertFullyIdle(facts);
    case 'final-answer':
      return assertFinalAnswer(assertion, facts);
    case 'canonical-turn':
      return assertCanonicalTurn(facts);
    case 'pi-runtime':
      return assertPiRuntime(assertion, facts, context);
    case 'skill':
      return assertSkill(assertion, facts);
    case 'prompt-composition':
      return assertPromptComposition(assertion, facts);
    case 'model':
      return assertModel(assertion, facts, context);
    case 'tool-call':
      return assertToolCall(assertion, facts);
    case 'task-terminal':
      return assertTaskTerminal(assertion, facts);
    case 'todo-projection':
      return assertTodoProjection(assertion, facts);
    case 'process-order':
      return assertProcessOrder(assertion, facts);
    case 'queue-state':
      return assertQueueState(assertion, facts);
    case 'cancellation':
      return assertCancellation(assertion, facts);
    case 'recovery':
      return assertRecovery(assertion, facts);
    case 'conversation-persistence':
      return assertConversationPersistence(assertion, facts);
    case 'retries':
      return assertRetries(assertion, facts);
    case 'terminal-idle':
      return assertTerminalIdle(assertion, facts);
    case 'structured-output':
      return evaluateStructuredOutput(assertion, facts, context);
    case 'markdown-path':
      return assertMarkdownPath(assertion, facts);
    case 'artifact':
      return assertArtifact(assertion, facts);
    case 'workspace-board-projection':
      return assertWorkspaceBoardProjection(assertion, facts);
    case 'no-fallback':
      return assertNoFallback(assertion, facts);
    default:
      throw new Error(`unsupported hard-gate evaluator: ${assertion.kind}`);
  }
}

function assertRuntimeErrorsEmpty(facts) {
  assertCompleteEvidence(facts, ['runtimeErrors', 'turns']);
  const errors = arrayOrEmpty(facts?.runtimeErrors);
  if (errors.length > 0)
    throw new Error(`runtime errors observed: ${errors.map(formatDiagnostic).join('; ')}`);
  const errorTurns = arrayOrEmpty(facts?.turns).filter((turn) => turn?.isError === true);
  if (errorTurns.length > 0) {
    throw new Error(
      `error turn(s) observed: ${errorTurns.map((turn) => turn.id ?? '(unknown)').join(', ')}`,
    );
  }
  return { runtimeErrorCount: 0, errorTurnCount: 0 };
}

function assertFullyIdle(facts) {
  if (facts?.idle?.fullyIdle !== true) {
    const busy = Object.entries(facts?.idle ?? {})
      .filter(([, concern]) => concern && typeof concern === 'object' && concern.idle === false)
      .map(([name]) => name);
    throw new Error(`session is not fully idle${busy.length > 0 ? `: ${busy.join(', ')}` : ''}`);
  }
  return { fullyIdle: true };
}

function assertTodoProjection(assertion, facts) {
  assertCompleteEvidence(facts, ['turns']);
  const turns = arrayOrEmpty(facts?.turns).filter((turn) => turn?.role === 'assistant');
  const todos = turns.flatMap((turn) => arrayOrEmpty(turn?.todos));
  const invalid = todos.filter(
    (todo) =>
      !['pending', 'in_progress', 'completed', 'blocked'].includes(todo?.status) ||
      typeof todo?.content !== 'string' ||
      todo.content.trim().length === 0,
  );
  if (invalid.length > 0) throw new Error('invalid TODO projection item observed');
  if (todos.length > assertion.maxItems) {
    throw new Error(`TODO projection exceeds ${assertion.maxItems} items: ${todos.length}`);
  }
  if (assertion.atMostOneInProgress) {
    for (const turn of turns) {
      const running = arrayOrEmpty(turn?.todos).filter((todo) => todo?.status === 'in_progress');
      if (running.length > 1) {
        throw new Error(
          `assistant turn ${turn.id ?? '(unknown)'} has multiple in-progress TODO items`,
        );
      }
    }
  }
  const observedStatuses = new Set(todos.map((todo) => todo.status));
  const missingStatuses = arrayOrEmpty(assertion.requiredStatuses).filter(
    (status) => !observedStatuses.has(status),
  );
  if (missingStatuses.length > 0) {
    throw new Error(`TODO projection is missing status(es): ${missingStatuses.join(', ')}`);
  }
  return { itemCount: todos.length, statuses: [...observedStatuses].sort() };
}

function assertFinalAnswer(assertion, facts) {
  assertCompleteEvidence(facts, ['turns']);
  const final = arrayOrEmpty(facts?.turns)
    .filter((turn) => turn?.role === 'assistant')
    .at(-1);
  const content = typeof final?.content === 'string' ? final.content : '';
  if (assertion.mode === 'non-empty' && content.trim().length === 0) {
    throw new Error('final assistant answer is empty or missing');
  }
  if (assertion.mode === 'contains') {
    const missing = assertion.text?.filter((text) => !content.includes(text)) ?? [];
    if (missing.length > 0)
      throw new Error(`final assistant answer is missing: ${missing.join(', ')}`);
  }
  if (assertion.mode === 'not-contains') {
    const present = assertion.text?.filter((text) => content.includes(text)) ?? [];
    if (present.length > 0)
      throw new Error(`final assistant answer contains forbidden text: ${present.join(', ')}`);
  }
  return { turnId: final?.id, length: content.length, mode: assertion.mode };
}

function assertCanonicalTurn(facts) {
  assertCompleteEvidence(facts, ['turns']);
  const turns = arrayOrEmpty(facts?.turns);
  const userIndex = turns.findIndex(
    (turn) => turn?.role === 'user' && (!turn.source || turn.source === 'user'),
  );
  const assistantIndex = turns.findIndex(
    (turn, index) => index > userIndex && turn?.role === 'assistant' && turn?.isError !== true,
  );
  if (userIndex < 0 || assistantIndex < 0) {
    throw new Error('canonical user-to-assistant turn sequence was not observed');
  }
  const internalUserTurn = turns.find(
    (turn) => turn?.role === 'user' && turn?.source && turn.source !== 'user',
  );
  if (internalUserTurn) {
    throw new Error(
      `internal continuation was projected as a user turn: ${internalUserTurn.id ?? '(unknown)'}`,
    );
  }
  return { userTurnId: turns[userIndex]?.id, assistantTurnId: turns[assistantIndex]?.id };
}

function assertPiRuntime(assertion, facts, context) {
  const runtime = facts?.piRuntime;
  if (!runtime || typeof runtime !== 'object') {
    throw new Error('canonical Pi runtime facts are unavailable');
  }
  if (runtime.implementation !== assertion.implementation) {
    throw new Error(
      `unexpected Agent runtime implementation: ${runtime.implementation ?? 'missing'}`,
    );
  }
  if (
    runtime.transcriptAuthority !== assertion.transcriptAuthority ||
    runtime.productMetadataAuthority !== assertion.productMetadataAuthority
  ) {
    throw new Error('Pi transcript or product metadata authority does not match the contract');
  }
  if (runtime.conversationId !== facts?.conversationId) {
    throw new Error('Pi runtime conversation identity disagrees with session facts');
  }
  if (
    !nonEmpty(runtime.conversationId) ||
    !nonEmpty(runtime.branchId) ||
    !nonEmpty(runtime.piSessionId) ||
    runtime.piSessionId === runtime.conversationId
  ) {
    throw new Error('conversation, branch, and Pi Session identities are missing or conflated');
  }
  if (!Number.isInteger(runtime.writerEpoch) || runtime.writerEpoch < 1) {
    throw new Error('Pi conversation writer epoch is missing or invalid');
  }
  const locator = runtime.workspaceLocator;
  if (
    locator?.kind !== assertion.workspaceLocatorKind ||
    typeof locator?.value !== 'string' ||
    !locator.value.startsWith('/__neko_workspaces/') ||
    locator.value.includes('..')
  ) {
    throw new Error('Pi runtime did not report a contained virtual workspace locator');
  }
  const turn = runtime.lastTurn;
  if (
    !nonEmpty(turn?.turnId) ||
    !nonEmpty(turn?.runId) ||
    turn?.purpose !== assertion.purpose ||
    !nonEmpty(turn?.providerId) ||
    !nonEmpty(turn?.modelId)
  ) {
    throw new Error('Pi turn identity or flat purpose-model identity is incomplete');
  }
  if (!isSha256(turn.parametersDigest) || !isSha256(turn.snapshotDigest)) {
    throw new Error('Pi turn parameter or immutable snapshot digest is missing');
  }
  if (turn.durability !== assertion.turnDurability) {
    throw new Error(
      `Pi turn durability mismatch: expected ${assertion.turnDurability}, observed ${turn.durability ?? 'missing'}`,
    );
  }
  if (
    !nonEmpty(turn.protocol) ||
    !nonEmpty(turn.authMechanism) ||
    !nonEmpty(turn.credentialSource)
  ) {
    throw new Error('Pi provider protocol/auth/credential provenance facts are incomplete');
  }
  if (assertion.modelProfileId) {
    const profile = arrayOrEmpty(context?.modelProfiles).find(
      (candidate) => candidate?.id === assertion.modelProfileId,
    );
    if (!profile) {
      throw new Error(`unknown Pi runtime model profile: ${assertion.modelProfileId}`);
    }
    for (const [purpose, expected] of Object.entries(profile.purposes ?? {})) {
      const observed = arrayOrEmpty(turn.modelPurposes).find(
        (candidate) => candidate?.purpose === purpose,
      );
      if (
        observed?.providerId !== expected.providerId ||
        observed?.configuredModelId !== expected.modelId ||
        observed?.execution !== expectedPurposeExecution(purpose) ||
        !nonEmpty(observed?.apiModelId) ||
        !isSha256(observed?.parametersDigest)
      ) {
        throw new Error(
          `Pi purpose model ${purpose} mismatch: expected ${expected.providerId}/${expected.modelId}`,
        );
      }
    }
  }
  if (
    hasModelIdentity(facts?.model) &&
    (facts.model.providerId !== turn.providerId || facts.model.modelId !== turn.modelId)
  ) {
    throw new Error('Pi turn model identity disagrees with effective session model facts');
  }
  return {
    implementation: runtime.implementation,
    conversationId: runtime.conversationId,
    branchId: runtime.branchId,
    piSessionId: runtime.piSessionId,
    writerEpoch: runtime.writerEpoch,
    purpose: turn.purpose,
    providerId: turn.providerId,
    modelId: turn.modelId,
    parametersDigest: turn.parametersDigest,
    snapshotDigest: turn.snapshotDigest,
    durability: turn.durability,
    protocol: turn.protocol,
    authMechanism: turn.authMechanism,
    credentialSource: turn.credentialSource,
  };
}

function expectedPurposeExecution(purpose) {
  return purpose.endsWith('.understand') ? 'pi' : 'domain';
}

function assertSkill(assertion, facts) {
  const collections =
    assertion.status === 'injected'
      ? ['skillActivations', 'promptComposition']
      : ['skillActivations'];
  assertCompleteEvidence(facts, collections);
  const activation = arrayOrEmpty(facts?.skillActivations).find((candidate) =>
    matchesSkillIdentity(candidate?.hostIdentity, assertion.identity),
  );
  if (!activation) {
    throw new Error(
      `Skill Host identity was not observed: ${formatSkillIdentity(assertion.identity)}`,
    );
  }
  if (!activation.triggerSource) {
    throw new Error(`Skill ${assertion.identity.name} has no trigger source evidence`);
  }
  if (activation.status === 'blocked' || activation.status === 'expired') {
    throw new Error(`Skill ${assertion.identity.name} is not active: ${activation.status}`);
  }
  if (assertion.status === 'injected') {
    const injected = arrayOrEmpty(activation.injectedFragments);
    if (injected.length === 0) {
      throw new Error(`Skill ${assertion.identity.name} has no injected fragment evidence`);
    }
    const composition = arrayOrEmpty(facts?.promptComposition);
    const missing = injected.filter(
      (fragment) =>
        !composition.some(
          (composed) =>
            composed?.id === fragment?.id &&
            composed?.source === fragment?.source &&
            composed?.hash === fragment?.hash &&
            composed?.version === fragment?.version,
        ),
    );
    if (missing.length > 0) {
      throw new Error(
        `Skill ${assertion.identity.name} fragment(s) were not present in actual prompt composition: ${missing.map((item) => item?.id ?? '(unknown)').join(', ')}`,
      );
    }
  }
  return {
    recordId: activation.id,
    skillName: activation.skillName,
    triggerSource: activation.triggerSource,
    status: assertion.status,
  };
}

function assertPromptComposition(assertion, facts) {
  assertCompleteEvidence(facts, ['promptComposition']);
  const fragments = arrayOrEmpty(facts?.promptComposition);
  const missing = assertion.requiredFragments.filter(
    (required) => !fragments.some((fragment) => matchesPromptFragment(fragment, required)),
  );
  if (missing.length > 0) {
    throw new Error(
      `required prompt fragment(s) missing: ${missing.map((item) => `${item.source}/${item.id}`).join(', ')}`,
    );
  }
  const forbidden = arrayOrEmpty(assertion.forbiddenFragmentIds).filter((id) =>
    fragments.some((fragment) => fragment?.id === id),
  );
  if (forbidden.length > 0) {
    throw new Error(`forbidden prompt fragment(s) observed: ${forbidden.join(', ')}`);
  }
  return {
    requiredFragments: assertion.requiredFragments,
    observedFragmentIds: fragments.map((fragment) => fragment?.id).filter(Boolean),
  };
}

function matchesPromptFragment(actual, expected) {
  return (
    actual?.id === expected.id &&
    actual?.source === expected.source &&
    (expected.version === undefined || actual?.version === expected.version) &&
    (expected.hash === undefined || actual?.hash === expected.hash)
  );
}

function assertModel(assertion, facts, context) {
  const profile = arrayOrEmpty(context?.modelProfiles).find(
    (candidate) => candidate?.id === assertion.profileId,
  );
  if (!profile) throw new Error(`model profile is unavailable: ${assertion.profileId}`);
  const observed = facts?.model;
  const effective = facts?.configuration?.chat;
  if (!hasModelIdentity(observed) || !hasModelIdentity(effective)) {
    throw new Error('actual provider/model identity is unavailable from session facts');
  }
  if (
    observed.providerId !== effective.providerId ||
    observed.modelId !== effective.modelId ||
    observed.providerExpressionProfileId !== effective.providerExpressionProfileId
  ) {
    throw new Error('model identity and effective configuration disagree');
  }
  if (profile.selection === 'explicit') {
    const expected = profile.chat;
    const mismatch =
      observed.providerId !== expected.providerId ||
      observed.modelId !== expected.modelId ||
      observed.providerExpressionProfileId !== expected.providerExpressionProfileId;
    if (mismatch) {
      throw new Error(
        `${assertion.noFallback ? 'model fallback observed' : 'model profile mismatch'}: expected ${formatModel(expected)}, observed ${formatModel(observed)}`,
      );
    }
  }
  return {
    profileId: profile.id,
    providerId: observed.providerId,
    modelId: observed.modelId,
    ...(observed.providerExpressionProfileId
      ? { providerExpressionProfileId: observed.providerExpressionProfileId }
      : {}),
    noFallback: assertion.noFallback,
  };
}

function assertToolCall(assertion, facts) {
  assertCompleteEvidence(facts, ['turns', 'turnToolCalls']);
  const calls = arrayOrEmpty(facts?.turns).flatMap((turn) => arrayOrEmpty(turn?.toolCalls));
  const named = calls.filter((call) => call?.name === assertion.name);
  if (assertion.status === 'absent') {
    if (named.length > 0) throw new Error(`forbidden tool call observed: ${assertion.name}`);
    return { name: assertion.name, status: 'absent', observedCount: 0 };
  }
  const matching = named.find((call) => matchesToolStatus(call?.status, assertion.status));
  if (!matching) {
    throw new Error(
      `tool call ${assertion.name} did not reach ${assertion.status}; observed=${named.map((call) => call?.status ?? 'unknown').join(',') || 'none'}`,
    );
  }
  if (
    assertion.expectedArguments !== undefined &&
    stableStringify(matching.arguments) !== stableStringify(assertion.expectedArguments)
  ) {
    throw new Error(`tool call ${assertion.name} arguments did not match the expected contract`);
  }
  if (
    assertion.resultIncludes !== undefined &&
    !containsExpectedValue(matching.result, assertion.resultIncludes)
  ) {
    throw new Error(`tool call ${assertion.name} result did not include the expected contract`);
  }
  if (assertion.status === 'success' && matching.resultObservation !== 'available') {
    throw new Error(`tool call ${assertion.name} succeeded without an observed result`);
  }
  if (assertion.status === 'error' && matching.resultObservation !== 'error') {
    throw new Error(`tool call ${assertion.name} failed without error observation evidence`);
  }
  return { id: matching.id, name: matching.name, status: assertion.status };
}

function containsExpectedValue(actual, expected) {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.every((item, index) => containsExpectedValue(actual[index], item))
    );
  }
  if (expected && typeof expected === 'object') {
    return (
      actual !== null &&
      typeof actual === 'object' &&
      !Array.isArray(actual) &&
      Object.entries(expected).every(([key, value]) => containsExpectedValue(actual[key], value))
    );
  }
  return Object.is(actual, expected);
}

function assertTaskTerminal(assertion, facts) {
  assertCompleteEvidence(facts, ['tasks']);
  const task = arrayOrEmpty(facts?.tasks).find(
    (candidate) => candidate?.type === assertion.taskType && candidate?.status === assertion.status,
  );
  if (!task) {
    throw new Error(`task ${assertion.taskType} did not reach terminal status ${assertion.status}`);
  }
  if (
    assertion.status === 'completed' &&
    !['available', 'observed'].includes(task.resultObservation?.status)
  ) {
    throw new Error(
      `completed task ${assertion.taskType} has no available/observed result evidence`,
    );
  }
  return {
    taskId: task.id,
    taskType: task.type,
    status: task.status,
    resultObservation: task.resultObservation?.status,
    ...(task.providerId ? { providerId: task.providerId } : {}),
    ...(task.modelId ? { modelId: task.modelId } : {}),
  };
}

function assertProcessOrder(assertion, facts) {
  const collections = new Set();
  for (const event of assertion.events) {
    if (event.kind === 'turn') collections.add('turns');
    if (event.kind === 'timeline') {
      collections.add('turns');
      collections.add('timelineRows');
    }
    if (event.kind === 'tool') {
      collections.add('turns');
      collections.add('turnToolCalls');
    }
    if (event.kind === 'task') collections.add('tasks');
    if (event.kind === 'continuation') collections.add('continuations');
  }
  assertCompleteEvidence(facts, [...collections]);
  const steps = readAutomationSteps(facts);
  let previous = { stepIndex: -1, itemIndex: -1, domain: undefined };
  const observed = [];
  for (const event of assertion.events) {
    const position = findEventPosition(event, steps, previous);
    if (!position) {
      throw new Error(`process event was not observed in order: ${formatProcessEvent(event)}`);
    }
    observed.push({ event, stepIndex: position.stepIndex, itemIndex: position.itemIndex });
    previous = position;
  }
  return { observed };
}

function assertQueueState(assertion, facts) {
  const step = requireAutomationStep(facts, assertion.stepId);
  const queue = step.snapshot?.messageQueue;
  if (!queue) throw new Error(`queue snapshot is unavailable at step ${assertion.stepId}`);
  if (assertion.status === 'queued') {
    const minPending = assertion.minPending ?? 1;
    if (step.method !== 'message.submit' || step.queued !== true) {
      throw new Error(`step ${assertion.stepId} was not accepted by the active TUI queue`);
    }
    if (!Number.isInteger(queue.pendingCount) || queue.pendingCount < minPending) {
      throw new Error(
        `queue pendingCount at ${assertion.stepId} is ${queue.pendingCount ?? 'unavailable'}; expected >= ${minPending}`,
      );
    }
  } else if (assertion.status === 'drained') {
    if (queue.pendingCount !== 0) {
      throw new Error(`queue was not drained at ${assertion.stepId}: ${queue.pendingCount}`);
    }
  } else if (queue.pausedAfterCancel !== true) {
    throw new Error(`queue was not paused after cancellation at ${assertion.stepId}`);
  }
  return {
    stepId: assertion.stepId,
    status: assertion.status,
    pendingCount: queue.pendingCount,
    version: queue.version,
    pausedAfterCancel: queue.pausedAfterCancel === true,
  };
}

function assertCancellation(assertion, facts) {
  const step = requireAutomationStep(facts, assertion.stepId);
  if (step.method !== 'message.cancel') {
    throw new Error(`step ${assertion.stepId} did not execute message.cancel`);
  }
  if (step.accepted !== assertion.accepted) {
    throw new Error(
      `cancellation ${assertion.stepId} accepted=${String(step.accepted)}; expected ${String(assertion.accepted)}`,
    );
  }
  return { stepId: assertion.stepId, accepted: step.accepted };
}

function assertRecovery(assertion, facts) {
  const steps = readAutomationSteps(facts);
  const resumeIndex = steps.findIndex((step) => step.id === assertion.resumeStepId);
  const submitIndex = steps.findIndex((step) => step.id === assertion.submitStepId);
  const idleIndex = steps.findIndex((step) => step.id === assertion.idleStepId);
  const resume = steps[resumeIndex];
  const submit = steps[submitIndex];
  const idle = steps[idleIndex];
  if (resume?.method !== 'session.resume') {
    throw new Error(`recovery resume step was not observed: ${assertion.resumeStepId}`);
  }
  if (submit?.method !== 'message.submit' || submitIndex <= resumeIndex) {
    throw new Error(`recovery submit did not follow resume: ${assertion.submitStepId}`);
  }
  if (
    idle?.method !== 'session.waitForIdle' ||
    idle?.fullyIdle !== true ||
    idleIndex <= submitIndex
  ) {
    throw new Error(`recovery did not reach terminal idle: ${assertion.idleStepId}`);
  }
  if (resume.conversationId !== submit.snapshot?.conversationId) {
    throw new Error('recovery submit did not continue the resumed conversation');
  }
  return {
    conversationId: resume.conversationId,
    resumeStepId: resume.id,
    submitStepId: submit.id,
    idleStepId: idle.id,
  };
}

function assertConversationPersistence(assertion, facts) {
  const persistence = facts?.conversationPersistence;
  if (!persistence) {
    throw new Error('conversation persistence facts are unavailable');
  }
  const mismatches = [
    ['authority', assertion.authority, persistence.authority],
    ['catalog', assertion.catalog, persistence.catalog],
    ['database scope', assertion.databaseScope, persistence.databaseScope],
    ['resume status', assertion.resumeStatus, persistence.resume?.status],
    ['record source', assertion.recordSource, persistence.resume?.recordSource],
  ].filter(([, expected, observed]) => expected !== observed);
  if (mismatches.length > 0) {
    throw new Error(
      `conversation persistence path mismatch: ${mismatches
        .map(
          ([label, expected, observed]) =>
            `${label} expected=${expected} observed=${observed ?? 'unavailable'}`,
        )
        .join('; ')}`,
    );
  }
  const restoredMessageCount = persistence.resume?.restoredMessageCount;
  if (
    !Number.isInteger(restoredMessageCount) ||
    restoredMessageCount < assertion.minRestoredMessages
  ) {
    throw new Error(
      `conversation resume restored ${restoredMessageCount ?? 'unavailable'} messages; expected >= ${assertion.minRestoredMessages}`,
    );
  }
  if (
    !persistence.resume?.requestedConversationId ||
    persistence.resume.requestedConversationId !== persistence.resume.restoredConversationId ||
    persistence.resume.restoredConversationId !== facts?.conversationId
  ) {
    throw new Error('conversation persistence identity did not match the resumed session');
  }
  return {
    authority: persistence.authority,
    catalog: persistence.catalog,
    databaseScope: persistence.databaseScope,
    conversationId: persistence.resume.restoredConversationId,
    recordSource: persistence.resume.recordSource,
    restoredMessageCount,
  };
}

function assertRetries(assertion, facts) {
  assertCompleteEvidence(facts, assertion.taskType ? ['tasks'] : []);
  const count = assertion.taskType
    ? arrayOrEmpty(facts?.tasks)
        .filter((task) => task?.type === assertion.taskType)
        .reduce((total, task) => total + readNonNegativeInteger(task?.retryCount), 0)
    : readNonNegativeInteger(facts?.retries?.taskRetryCount);
  if (count < assertion.min || (assertion.max !== undefined && count > assertion.max)) {
    throw new Error(
      `retry count ${count} is outside ${assertion.min}..${assertion.max ?? 'unbounded'}`,
    );
  }
  return {
    count,
    min: assertion.min,
    ...(assertion.max !== undefined ? { max: assertion.max } : {}),
  };
}

function assertTerminalIdle(assertion, facts) {
  const failed = assertion.concerns.filter((name) => {
    const concern = facts?.idle?.[name];
    return concern?.idle !== true || concern?.terminal !== true;
  });
  if (failed.length > 0) {
    throw new Error(`terminal idle concern(s) failed: ${failed.join(', ')}`);
  }
  return { concerns: assertion.concerns };
}

function assertMarkdownPath(assertion, facts) {
  assertCompleteEvidence(facts, ['markdownPathEvents']);
  const events = arrayOrEmpty(facts?.markdown?.pathEvents);
  const forbidden = arrayOrEmpty(assertion.forbiddenEvents);
  const observedForbidden = events.filter((event) => forbidden.includes(event?.type));
  if (observedForbidden.length > 0) {
    throw new Error(
      `forbidden Markdown path event(s) observed: ${[...new Set(observedForbidden.map((event) => event.type))].join(', ')}`,
    );
  }
  const byKey = new Map();
  for (const event of events) {
    if (typeof event?.key !== 'string') continue;
    const group = byKey.get(event.key) ?? [];
    group.push(event);
    byKey.set(event.key, group);
  }
  const matching = [...byKey.entries()].filter(([, group]) => {
    if (!assertion.requiredEvents.every((type) => group.some((event) => event.type === type))) {
      return false;
    }
    return arrayOrEmpty(assertion.viewportWidths).every((width) =>
      group.some((event) => event.type === 'layout-created' && event.viewportWidth === width),
    );
  });
  if (matching.length === 0) {
    throw new Error(
      `no Markdown session observed required path: ${assertion.requiredEvents.join(', ')}`,
    );
  }
  if (assertion.sameRevisionForViewportWidths === true) {
    const widths = new Set(arrayOrEmpty(assertion.viewportWidths));
    const sameRevision = matching.some(([, group]) => {
      const revisions = new Set(
        group
          .filter((event) => event.type === 'layout-created' && widths.has(event.viewportWidth))
          .map((event) => event.revision),
      );
      return revisions.size === 1;
    });
    if (!sameRevision) throw new Error('viewport widths did not reuse one Markdown revision');
  }
  return {
    keys: matching.map(([key]) => key),
    requiredEvents: assertion.requiredEvents,
    viewportWidths: assertion.viewportWidths ?? [],
  };
}

function findEventPosition(event, steps, after) {
  const domain = event.kind;
  for (let stepIndex = Math.max(after.stepIndex, 0); stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const items = eventItems(event, step);
    const start =
      stepIndex === after.stepIndex && domain === after.domain ? after.itemIndex + 1 : 0;
    for (let itemIndex = start; itemIndex < items.length; itemIndex += 1) {
      if (matchesProcessEvent(event, items[itemIndex])) {
        return { stepIndex, itemIndex, domain };
      }
    }
  }
  return undefined;
}

function eventItems(event, step) {
  if (event.kind === 'workflow-step') return [step];
  const snapshot = step?.snapshot;
  if (!snapshot) return [];
  if (event.kind === 'turn') return arrayOrEmpty(snapshot.turns);
  if (event.kind === 'tool') {
    return arrayOrEmpty(snapshot.turns).flatMap((turn) => arrayOrEmpty(turn?.toolCalls));
  }
  if (event.kind === 'timeline') {
    return arrayOrEmpty(snapshot.turns)
      .flatMap((turn) => arrayOrEmpty(turn?.timeline))
      .sort((left, right) => (left?.sequence ?? 0) - (right?.sequence ?? 0));
  }
  if (event.kind === 'task') {
    return [...arrayOrEmpty(snapshot.tasks)].sort(
      (left, right) => (left?.createdAt ?? 0) - (right?.createdAt ?? 0),
    );
  }
  return [...arrayOrEmpty(snapshot.continuations)].sort(
    (left, right) => (left?.timestamp ?? 0) - (right?.timestamp ?? 0),
  );
}

function matchesProcessEvent(event, item) {
  if (event.kind === 'workflow-step') {
    return item?.id === event.stepId && (!event.method || item?.method === event.method);
  }
  if (event.kind === 'turn') {
    return item?.role === event.role && (!event.source || item?.source === event.source);
  }
  if (event.kind === 'timeline') {
    return (
      item?.kind === event.eventKind &&
      (!event.status || item?.status === event.status) &&
      (!event.toolName || item?.toolName === event.toolName) &&
      (!event.contentContains || item?.content?.includes(event.contentContains))
    );
  }
  if (event.kind === 'tool') {
    return item?.name === event.name && (!event.status || item?.status === event.status);
  }
  if (event.kind === 'task') {
    return item?.type === event.taskType && (!event.status || item?.status === event.status);
  }
  return item?.source === event.source && (!event.status || item?.status === event.status);
}

function requireAutomationStep(facts, stepId) {
  const step = readAutomationSteps(facts).find((candidate) => candidate?.id === stepId);
  if (!step) throw new Error(`workflow step was not observed: ${stepId}`);
  return step;
}

function readAutomationSteps(facts) {
  const trace = facts?.automation;
  if (trace?.schema !== 'neko.agent-eval.workflow-trace.v1' || !Array.isArray(trace.steps)) {
    throw new Error('workflow controller trace is unavailable');
  }
  return trace.steps;
}

function formatProcessEvent(event) {
  return JSON.stringify(event);
}

function readNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function assertArtifact(assertion, facts) {
  assertCompleteEvidence(facts, ['artifacts']);
  const artifacts = arrayOrEmpty(facts?.artifacts);
  const artifact = assertion.artifactRef
    ? artifacts.find((candidate) => candidate?.ref === assertion.artifactRef)
    : artifacts.find(
        (candidate) =>
          candidate?.kind === assertion.artifactKind &&
          (!assertion.provenanceSource ||
            candidate?.provenance?.source === assertion.provenanceSource),
      );
  if (!artifact) {
    if (assertion.artifactRef) {
      throw new Error(`artifact was not observed: ${assertion.artifactRef}`);
    }
    throw new Error(
      `artifact selector was not observed: kind=${assertion.artifactKind}, provenance=${assertion.provenanceSource ?? 'any'}`,
    );
  }
  if (artifact.validator?.status !== assertion.validatorStatus) {
    throw new Error(
      `artifact ${assertion.artifactRef} validator status is ${artifact.validator?.status ?? 'unavailable'}; expected ${assertion.validatorStatus}`,
    );
  }
  if (artifact.deliveryStatus !== 'delivered') {
    throw new Error(
      `artifact ${assertion.artifactRef} was not durably delivered: ${artifact.deliveryStatus ?? 'unavailable'}`,
    );
  }
  if (typeof artifact.digest !== 'string' || artifact.digest.length === 0) {
    throw new Error(`artifact ${assertion.artifactRef} has no content digest evidence`);
  }
  if (!artifact.provenance?.source) {
    throw new Error(`artifact ${assertion.artifactRef} has no provenance evidence`);
  }
  if (artifact.kind === 'file' && !artifact.relativePath) {
    throw new Error(`file artifact ${assertion.artifactRef} has no durable relative path`);
  }
  if (artifact.kind === 'project-revision' && !artifact.revision) {
    throw new Error(`project artifact ${assertion.artifactRef} has no revision evidence`);
  }
  return {
    ref: artifact.ref,
    kind: artifact.kind,
    digest: artifact.digest,
    deliveryStatus: artifact.deliveryStatus,
    validatorId: artifact.validator.id,
    validatorStatus: artifact.validator.status,
  };
}

function assertNoFallback(assertion, facts) {
  assertCompleteEvidence(facts, [
    'turns',
    'turnToolCalls',
    'skillActivations',
    'tasks',
    'continuations',
    'promptComposition',
    'artifacts',
    'runtimeErrors',
  ]);
  const observed = collectRuntimeRefs(facts);
  const forbidden = assertion.forbiddenRefs.filter((ref) => observed.has(ref));
  if (forbidden.length > 0) {
    throw new Error(`forbidden fallback reference(s) observed: ${forbidden.join(', ')}`);
  }
  return { forbiddenRefs: assertion.forbiddenRefs, observedForbiddenRefs: [] };
}

function assertWorkspaceBoardProjection(assertion, facts) {
  assertCompleteEvidence(facts, ['workspaceBoardProjections']);
  const projection = arrayOrEmpty(facts?.workspaceBoardProjections).find(
    (candidate) =>
      candidate?.status === assertion.status && candidate?.targetKind === assertion.targetKind,
  );
  if (!projection) {
    throw new Error(
      `Workspace Board projection ${assertion.status}/${assertion.targetKind} was not observed`,
    );
  }
  if (arrayOrEmpty(projection.nodeIds).length < assertion.minNodeIds) {
    throw new Error(
      `Workspace Board projection has ${arrayOrEmpty(projection.nodeIds).length} node id(s); expected at least ${assertion.minNodeIds}`,
    );
  }
  if (assertion.revisionRequired && !projection.revision) {
    throw new Error('Workspace Board projection has no revision evidence');
  }
  if (assertion.diagnosticsEmpty && arrayOrEmpty(projection.diagnosticCodes).length > 0) {
    throw new Error(
      `Workspace Board projection diagnostics observed: ${projection.diagnosticCodes.join(', ')}`,
    );
  }
  return {
    status: projection.status,
    targetKind: projection.targetKind,
    revision: projection.revision,
    nodeIds: projection.nodeIds,
    diagnosticCodes: projection.diagnosticCodes,
  };
}

function assertCompleteEvidence(facts, collections) {
  for (const collection of collections) {
    const completeness = facts?.evidenceCompleteness?.[collection];
    if (!completeness || !Number.isInteger(completeness.droppedCount)) {
      throw new Error(`evidence completeness is unavailable for ${collection}`);
    }
    if (completeness.droppedCount > 0) {
      throw new Error(
        `evidence for ${collection} is incomplete; dropped ${completeness.droppedCount} item(s)`,
      );
    }
  }
}

function matchesSkillIdentity(actual, expected) {
  return (
    actual?.portableName === expected?.name &&
    actual?.source === expected?.source &&
    actual?.provenance === expected?.provenance &&
    actual?.rootId === expected?.rootId &&
    actual?.relativePath === expected?.relativePath &&
    actual?.fingerprint === expected?.fingerprint
  );
}

function formatSkillIdentity(identity) {
  return `${identity?.name ?? 'unknown'}@${identity?.source ?? 'unknown'}:${identity?.rootId ?? 'unknown'}/${identity?.relativePath ?? 'unknown'}#${identity?.fingerprint ?? 'unknown'}`;
}

function hasModelIdentity(value) {
  return (
    value &&
    typeof value.providerId === 'string' &&
    value.providerId.length > 0 &&
    typeof value.modelId === 'string' &&
    value.modelId.length > 0 &&
    value.providerId !== 'unavailable' &&
    value.modelId !== 'unavailable'
  );
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha256(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function formatModel(value) {
  return `${value?.providerId ?? 'unavailable'}/${value?.modelId ?? 'unavailable'}${value?.providerExpressionProfileId ? `#${value.providerExpressionProfileId}` : ''}`;
}

function matchesToolStatus(actual, expected) {
  if (expected === 'success') return actual === 'success' || actual === 'complete';
  return actual === 'error';
}

function collectRuntimeRefs(facts) {
  const refs = new Set();
  addValues(refs, facts?.piRuntime);
  addValues(refs, facts?.model);
  addValues(refs, facts?.configuration?.chat);
  addValue(refs, facts?.configuration?.digest);
  for (const activation of arrayOrEmpty(facts?.skillActivations)) {
    addValue(refs, activation?.id);
    addValue(refs, activation?.skillName);
    addValues(refs, activation?.hostIdentity);
    addValues(refs, activation?.injectedFragments);
    addValues(refs, activation?.toolPolicyIds);
  }
  for (const turn of arrayOrEmpty(facts?.turns)) {
    addValue(refs, turn?.id);
    for (const call of arrayOrEmpty(turn?.toolCalls)) {
      addValue(refs, call?.id);
      addValue(refs, call?.name);
      addValues(
        refs,
        call?.diagnostics?.map((item) => item?.code),
      );
    }
  }
  for (const task of arrayOrEmpty(facts?.tasks)) {
    addValue(refs, task?.id);
    addValue(refs, task?.type);
    addValue(refs, task?.providerId);
    addValue(refs, task?.modelId);
    addValues(refs, task?.resultObservation?.observationIds);
    addValues(
      refs,
      task?.diagnostics?.map((item) => item?.code),
    );
  }
  for (const continuation of arrayOrEmpty(facts?.continuations)) {
    addValue(refs, continuation?.id);
    addValue(refs, continuation?.source);
    addValues(
      refs,
      continuation?.diagnostics?.map((item) => item?.code),
    );
  }
  for (const fragment of arrayOrEmpty(facts?.promptComposition)) addValues(refs, fragment);
  for (const artifact of arrayOrEmpty(facts?.artifacts)) {
    addValue(refs, artifact?.ref);
    addValue(refs, artifact?.kind);
    addValue(refs, artifact?.relativePath);
    addValue(refs, artifact?.digest);
    addValue(refs, artifact?.revision);
    addValues(refs, artifact?.provenance);
    addValue(refs, artifact?.validator?.id);
    addValues(
      refs,
      artifact?.diagnostics?.map((item) => item?.code),
    );
  }
  for (const projection of arrayOrEmpty(facts?.workspaceBoardProjections)) {
    addValue(refs, projection?.status);
    addValue(refs, projection?.targetKind);
    addValue(refs, projection?.revision);
    addValues(refs, projection?.nodeIds);
    addValues(refs, projection?.diagnosticCodes);
  }
  for (const diagnostic of arrayOrEmpty(facts?.runtimeErrors)) {
    if (typeof diagnostic === 'string') addValue(refs, diagnostic);
    else addValue(refs, diagnostic?.code);
  }
  return refs;
}

function addValues(target, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => addValues(target, item));
    return;
  }
  if (!value || typeof value !== 'object') {
    addValue(target, value);
    return;
  }
  Object.values(value).forEach((item) => addValues(target, item));
}

function addValue(target, value) {
  if (typeof value === 'string' && value.length > 0) target.add(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function classification(outcome, error) {
  return {
    outcome,
    ...(error
      ? {
          diagnostic: {
            code: typeof error === 'object' && error ? error.code : undefined,
            message: error instanceof Error ? error.message : String(error),
          },
        }
      : {}),
  };
}

function formatDiagnostic(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return `${value.code ?? 'runtime-error'}: ${value.message ?? JSON.stringify(value)}`;
  }
  return String(value);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

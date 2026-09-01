import { evaluateStructuredOutput } from './structured-output.mjs';
import { isDesktopEvaluationFacts, runDesktopHardGate } from '../desktop/evidence.mjs';

const EVALUATION_OUTCOMES = Object.freeze({
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
  if (isDesktopEvaluationFacts(facts)) {
    return runDesktopHardGate(assertion, facts, context);
  }
  switch (assertion.kind) {
    case 'runtime-errors-empty':
      return assertRuntimeErrorsEmpty(facts);
    case 'fully-idle':
      return assertFullyIdle(facts);
    case 'final-answer':
      return assertFinalAnswer(assertion, facts);
    case 'canonical-turn':
      return assertCanonicalTurn(facts);
    case 'skill':
      return assertSkill(assertion, facts);
    case 'prompt-composition':
      return assertPromptComposition(assertion, facts);
    case 'model':
      return assertModel(assertion, facts, context);
    case 'todo-projection':
      return assertTodoProjection(assertion, facts);
    case 'cancellation':
      return assertCancellation(assertion, facts);
    case 'recovery':
      return assertRecovery(assertion, facts);
    case 'conversation-persistence':
      return assertConversationPersistence(assertion, facts);
    case 'terminal-idle':
      return assertTerminalIdle(assertion, facts);
    case 'structured-output':
      return evaluateStructuredOutput(assertion, facts, context);
    case 'markdown-path':
      return assertMarkdownPath(assertion, facts);
    case 'artifact':
      return assertArtifact(assertion, facts);
    case 'content-locator-handoff':
      return assertContentLocatorHandoff(assertion, facts);
    case 'canvas-artifact-projection':
      return assertCanvasArtifactProjection(assertion, facts);
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

function assertSkill(assertion, facts) {
  assertCompleteEvidence(facts, ['skillReceipts']);
  const receipt = arrayOrEmpty(facts?.skillReceipts).find((candidate) =>
    matchesSkillReceipt(candidate, assertion.identity),
  );
  if (!receipt) {
    throw new Error(
      `DSH read_skill receipt was not observed: ${formatSkillIdentity(assertion.identity)}`,
    );
  }
  if (!nonEmpty(receipt.toolCallId)) {
    throw new Error(`Skill ${assertion.identity.name} receipt has no ToolCall identity`);
  }
  if (receipt.locatorKind !== 'skill' && receipt.locatorKind !== 'skill-resource') {
    throw new Error(`Skill ${assertion.identity.name} receipt has no locator class`);
  }
  return {
    toolCallId: receipt.toolCallId,
    skillName: receipt.skillName,
    source: receipt.source,
    fingerprint: receipt.fingerprint,
    locatorKind: receipt.locatorKind,
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
  return {
    requiredFragments: assertion.requiredFragments,
    observedFragmentIds: fragments.map((fragment) => fragment?.id).filter(Boolean),
  };
}

function matchesPromptFragment(actual, expected) {
  return (
    actual?.id === expected.id &&
    actual?.source === expected.source &&
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
        `model profile mismatch: expected ${formatModel(expected)}, observed ${formatModel(observed)}`,
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
  return {
    keys: matching.map(([key]) => key),
    requiredEvents: assertion.requiredEvents,
    viewportWidths: assertion.viewportWidths ?? [],
  };
}

function requireAutomationStep(facts, stepId) {
  const step = readAutomationSteps(facts).find((candidate) => candidate?.id === stepId);
  if (!step) throw new Error(`workflow step was not observed: ${stepId}`);
  return step;
}

function readAutomationSteps(facts) {
  const trace = facts?.automation;
  if (trace?.schema !== 'neko.agent-eval.workflow-trace' || !Array.isArray(trace.steps)) {
    throw new Error('workflow controller trace is unavailable');
  }
  return trace.steps;
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
  if (assertion.validatorId && artifact.validator?.id !== assertion.validatorId) {
    throw new Error(
      `artifact ${assertion.artifactRef} validator is ${artifact.validator?.id ?? 'unavailable'}; expected ${assertion.validatorId}`,
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
  if (assertion.contentLocatorKind) {
    assertContentLocatorEvidence(artifact.contentLocator, assertion.contentLocatorKind);
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
    ...(assertion.contentLocatorKind ? { contentLocatorKind: artifact.contentLocator.kind } : {}),
  };
}

function assertContentLocatorHandoff(assertion, facts) {
  assertCompleteEvidence(facts, ['turns', 'turnToolCalls', 'artifacts']);
  const calls = arrayOrEmpty(facts?.turns).flatMap((turn) => arrayOrEmpty(turn?.toolCalls));
  const producer = requireSuccessfulToolCall(calls, assertion.producerToolName);
  const consumer = requireSuccessfulToolCall(calls, assertion.consumerToolName);
  const producerLocators = collectContentLocators(producer.result, assertion.locatorKind);
  const consumerLocators = collectContentLocators(consumer.arguments, assertion.locatorKind);
  if (producerLocators.length !== 1) {
    throw new Error(
      `${assertion.producerToolName} exposed ${producerLocators.length} distinct ${assertion.locatorKind} locator(s); expected exactly one`,
    );
  }
  if (consumerLocators.length !== 1) {
    throw new Error(
      `${assertion.consumerToolName} consumed ${consumerLocators.length} distinct ${assertion.locatorKind} locator(s); expected exactly one`,
    );
  }
  const producerLocator = producerLocators[0];
  const consumerLocator = consumerLocators[0];
  assertContentLocatorEvidence(producerLocator, assertion.locatorKind);
  assertContentLocatorEvidence(consumerLocator, assertion.locatorKind);
  if (stableStringify(producerLocator) !== stableStringify(consumerLocator)) {
    throw new Error(
      `${assertion.consumerToolName} did not consume the exact locator returned by ${assertion.producerToolName}`,
    );
  }
  const matchingArtifacts = arrayOrEmpty(facts?.artifacts).filter(
    (artifact) =>
      artifact?.kind === assertion.artifactKind &&
      artifact?.provenance?.source === assertion.provenanceSource &&
      artifact?.validator?.id === assertion.validatorId &&
      artifact?.validator?.status === 'valid' &&
      artifact?.deliveryStatus === 'delivered' &&
      stableStringify(artifact?.contentLocator) === stableStringify(producerLocator),
  );
  if (matchingArtifacts.length !== 1) {
    throw new Error(
      `expected exactly one delivered artifact carrying the handed-off locator; observed ${matchingArtifacts.length}`,
    );
  }
  return {
    producerToolCallId: producer.id,
    consumerToolCallId: consumer.id,
    artifactRef: matchingArtifacts[0].ref,
    locatorKind: assertion.locatorKind,
  };
}

function requireSuccessfulToolCall(calls, name) {
  const matching = calls.filter(
    (call) =>
      call?.name === name &&
      matchesToolStatus(call?.status, 'success') &&
      call?.resultObservation === 'available',
  );
  if (matching.length !== 1) {
    throw new Error(
      `expected exactly one successful ${name} Tool Call; observed ${matching.length}`,
    );
  }
  return matching[0];
}

function collectContentLocators(value, kind) {
  const locators = new Map();
  visit(value);
  return [...locators.values()];

  function visit(candidate) {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    if (candidate.kind === kind) {
      locators.set(stableStringify(candidate), candidate);
      return;
    }
    Object.values(candidate).forEach(visit);
  }
}

function assertContentLocatorEvidence(locator, expectedKind) {
  if (!locator || typeof locator !== 'object' || locator.kind !== expectedKind) {
    throw new Error(`artifact has no ${expectedKind} content locator evidence`);
  }
  if (expectedKind === 'generated-output') {
    for (const field of ['outputId', 'revision', 'digest', 'path']) {
      if (!nonEmpty(locator[field])) {
        throw new Error(`generated-output content locator is missing ${field}`);
      }
    }
    if (!isPortableWorkspacePath(locator.path)) {
      throw new Error(
        'generated-output content locator path is not portable and workspace-relative',
      );
    }
  }
}

function isPortableWorkspacePath(value) {
  if (!nonEmpty(value) || value.includes('\\') || value.includes('${') || value.includes('\0')) {
    return false;
  }
  if (value.startsWith('/') || /^[A-Za-z]:(?:\/|$)/u.test(value)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) return false;
  const segments = value.split('/');
  return !segments.some(
    (segment) =>
      segment.length === 0 || segment === '.' || segment === '..' || segment.includes(':'),
  );
}

function assertCanvasArtifactProjection(assertion, facts) {
  assertCompleteEvidence(facts, ['canvasArtifactProjections']);
  const projection = arrayOrEmpty(facts?.canvasArtifactProjections).find(
    (candidate) =>
      candidate?.status === assertion.status && candidate?.targetKind === assertion.targetKind,
  );
  if (!projection) {
    throw new Error(
      `Canvas projection ${assertion.status}/${assertion.targetKind} was not observed`,
    );
  }
  if (arrayOrEmpty(projection.nodeIds).length < assertion.minNodeIds) {
    throw new Error(
      `Canvas projection has ${arrayOrEmpty(projection.nodeIds).length} node id(s); expected at least ${assertion.minNodeIds}`,
    );
  }
  if (
    assertion.minConnectionIds !== undefined &&
    arrayOrEmpty(projection.connectionIds).length < assertion.minConnectionIds
  ) {
    throw new Error(
      `Canvas projection has ${arrayOrEmpty(projection.connectionIds).length} connection id(s); expected at least ${assertion.minConnectionIds}`,
    );
  }
  if (assertion.sourceFingerprintRequired && !projection.sourceFingerprint) {
    throw new Error('Canvas projection has no source fingerprint evidence');
  }
  if (assertion.diagnosticsEmpty && arrayOrEmpty(projection.diagnosticCodes).length > 0) {
    throw new Error(
      `Canvas projection diagnostics observed: ${projection.diagnosticCodes.join(', ')}`,
    );
  }
  return {
    status: projection.status,
    targetKind: projection.targetKind,
    sourceFingerprint: projection.sourceFingerprint,
    nodeIds: projection.nodeIds,
    connectionIds: projection.connectionIds,
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

function matchesSkillReceipt(actual, expected) {
  return (
    actual?.skillName === expected?.name &&
    actual?.source === expected?.source &&
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

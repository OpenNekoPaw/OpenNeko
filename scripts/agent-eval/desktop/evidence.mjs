const DESKTOP_EVIDENCE_ASSERTION_KINDS = new Set([
  'runtime-errors-empty',
  'fully-idle',
  'canonical-turn',
  'pi-runtime',
  'final-answer',
  'skill',
  'model',
  'tool-call',
  'cancellation',
  'recovery',
  'conversation-persistence',
  'terminal-idle',
  'timeline-projection',
  'resource-display-projection',
  'no-fallback',
]);

export function createDesktopEvaluationFacts(input) {
  if (
    !input?.facts ||
    !input?.identity ||
    !input?.workflow ||
    !input?.projection ||
    !input?.snapshot
  ) {
    throw new Error('Desktop Agent complete-session evidence is incomplete.');
  }
  return Object.freeze({
    schema: 'neko.agent-eval.desktop-session-facts.v1',
    neutralFacts: input.facts,
    identity: input.identity,
    workflow: input.workflow,
    projection: input.projection,
    snapshot: input.snapshot,
    ...(input.mediaCard === undefined ? {} : { mediaCard: input.mediaCard }),
    openNekoResourceRequestCount: input.openNekoResourceRequestCount ?? 0,
  });
}

export function requiresOpenNekoResourceObservation(assertions) {
  return assertions.some(
    (assertion) =>
      assertion.kind === 'resource-display-projection' &&
      assertion.status === 'authorized' &&
      assertion.transport === 'openneko-resource',
  );
}

export function assertDesktopEvidenceSupport(assertions) {
  const unsupported = assertions.find(
    (assertion) => !DESKTOP_EVIDENCE_ASSERTION_KINDS.has(assertion.kind),
  );
  if (unsupported) {
    throw configurationError(
      `Desktop Agent assertion '${unsupported.kind}' is not supported by the Desktop evidence boundary.`,
    );
  }
}

export function isDesktopEvaluationFacts(facts) {
  return facts?.schema === 'neko.agent-eval.desktop-session-facts.v1';
}

export function runDesktopHardGate(assertion, facts, context) {
  if (!isDesktopEvaluationFacts(facts)) {
    throw new Error('Desktop Agent hard gate requires complete-session facts.');
  }
  const input = {
    facts: facts.neutralFacts,
    identity: facts.identity,
    workflow: facts.workflow,
    projection: facts.projection,
    snapshot: facts.snapshot,
    mediaCard: facts.mediaCard,
    openNekoResourceRequestCount: facts.openNekoResourceRequestCount,
    executionCase: context.executionCase,
    authorization: context.authorization,
  };
  assertCanonicalFacts(input);
  switch (assertion.kind) {
    case 'runtime-errors-empty':
      return assertRuntimeErrorsEmpty(input.facts);
    case 'fully-idle':
      return assertFullyIdle(input);
    case 'canonical-turn':
      return { identity: input.identity };
    case 'pi-runtime':
      return assertPiRuntime(assertion, input.facts);
    case 'final-answer':
      return assertFinalAnswer(assertion, input.snapshot);
    case 'skill':
      return assertSkill(assertion, input.facts);
    case 'model':
      return assertModel(assertion, input);
    case 'tool-call':
      return assertToolCall(assertion, input);
    case 'cancellation':
      return assertCancellation(assertion, input.workflow);
    case 'recovery':
      return assertRecovery(assertion, input.workflow);
    case 'conversation-persistence':
      return assertConversationPersistence(assertion, input);
    case 'terminal-idle':
      return assertFullyIdle(input);
    case 'timeline-projection':
      return assertTimelineProjection(assertion, input);
    case 'resource-display-projection':
      return assertResourceDisplayProjection(assertion, input);
    case 'no-fallback':
      return assertNoFallback(assertion, input);
    default:
      throw configurationError(
        `Desktop Agent assertion '${assertion.kind}' reached execution without an evidence adapter.`,
      );
  }
}

function assertCanonicalFacts(input) {
  const { facts, identity, authorization } = input;
  if (
    facts.identity.conversationId !== identity.conversationId ||
    facts.identity.turnId !== identity.turnId ||
    facts.identity.runId !== identity.runId
  ) {
    throw new Error('Desktop Agent terminal facts identity is stale or mismatched.');
  }
  if (
    facts.configuration.effective.values.modelBinding.providerId !== authorization.providerId ||
    facts.configuration.effective.values.modelBinding.modelId !== authorization.modelId
  ) {
    throw new Error('Desktop Agent effective provider/model differs from the approved identity.');
  }
  if (
    facts.runtimePath.controller !== 'sender-bound-desktop-agent-controller' ||
    facts.runtimePath.runtime !== 'pi-conversation-runtime' ||
    facts.runtimePath.transcript !== 'pi-session' ||
    facts.runtimePath.metadata !== 'sqlite' ||
    facts.runtimePath.projection !== 'conversation-projection-store' ||
    facts.runtimePath.forbiddenPathCount !== 0
  ) {
    throw new Error(
      'Desktop Agent terminal facts did not use the canonical complete-session path.',
    );
  }
  if (facts.persistence.checkpoint !== 'observed' || facts.disposal.status !== 'disposed') {
    throw new Error('Desktop Agent persistence or disposal facts are incomplete.');
  }
  for (const collection of [
    ...Object.values(facts.receipts),
    facts.resourceDisplayProjections,
    facts.diagnostics,
  ]) {
    if (collection.droppedCount !== 0) {
      throw new Error('Desktop Agent required facts were truncated.');
    }
  }
  assertFactsContainNoRenderUrl(facts);
}

function assertRuntimeErrorsEmpty(facts) {
  const errors = facts.diagnostics.items.filter((item) => item.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `Desktop Agent runtime errors observed: ${errors.map((item) => item.code).join(', ')}`,
    );
  }
  return { runtimeErrorCount: 0 };
}

function assertFullyIdle(input) {
  if (!input.workflow.terminalIdle?.identity) {
    throw new Error('Desktop Agent workflow did not reach terminal idle.');
  }
  if (!['completed', 'cancelled'].includes(input.facts.projection.terminalState)) {
    throw new Error(`Desktop Agent terminal state is ${input.facts.projection.terminalState}.`);
  }
  return { fullyIdle: true, terminalState: input.facts.projection.terminalState };
}

function assertPiRuntime(assertion, facts) {
  if (
    assertion.implementation !== 'pi-agent-core' ||
    assertion.transcriptAuthority !== facts.runtimePath.transcript ||
    assertion.productMetadataAuthority !== facts.runtimePath.metadata ||
    assertion.purpose !== 'agent.main' ||
    assertion.workspaceLocatorKind !== 'virtual' ||
    assertion.turnDurability !== facts.persistence.durability
  ) {
    throw new Error('Desktop Agent Pi runtime facts do not match the Scenario contract.');
  }
  return {
    implementation: assertion.implementation,
    conversationId: facts.identity.conversationId,
    branchId: facts.identity.branchId,
    piSessionId: facts.identity.piSessionId,
    turnId: facts.identity.turnId,
    runId: facts.identity.runId,
    durability: facts.persistence.durability,
  };
}

function assertFinalAnswer(assertion, snapshot) {
  const final = snapshot?.messages
    ?.filter((message) => message?.role === 'assistant' && message.isError !== true)
    .at(-1);
  const content = typeof final?.content === 'string' ? final.content : '';
  if (assertion.mode === 'non-empty' && content.trim().length === 0) {
    throw new Error('Desktop Agent final assistant answer is empty or missing.');
  }
  if (assertion.mode === 'contains') {
    const missing = assertion.text.filter((text) => !content.includes(text));
    if (missing.length > 0) {
      throw new Error(`Desktop Agent final answer is missing: ${missing.join(', ')}`);
    }
  }
  if (assertion.mode === 'not-contains') {
    const present = assertion.text.filter((text) => content.includes(text));
    if (present.length > 0) {
      throw new Error(`Desktop Agent final answer contains forbidden text: ${present.join(', ')}`);
    }
  }
  return { messageId: final?.id, length: content.length, mode: assertion.mode };
}

function assertSkill(assertion, facts) {
  const receipt = facts.receipts.skills.items.find(
    (item) =>
      item.name === assertion.identity.name &&
      item.source === assertion.identity.source &&
      item.fingerprint === assertion.identity.fingerprint &&
      item.status === assertion.status,
  );
  if (!receipt)
    throw new Error(`Desktop Agent Skill receipt is unavailable: ${assertion.identity.name}`);
  return receipt;
}

function assertModel(assertion, input) {
  const profile = input.executionCase.modelProfiles.find((item) => item.id === assertion.profileId);
  if (!profile)
    throw new Error(`Desktop Agent model profile is unavailable: ${assertion.profileId}`);
  const effective = input.facts.configuration.effective.values.modelBinding;
  if (profile.selection === 'explicit') {
    if (
      effective.providerId !== profile.chat.providerId ||
      effective.modelId !== profile.chat.modelId
    ) {
      throw new Error('Desktop Agent effective model does not match the declared model profile.');
    }
  }
  return { profileId: profile.id, providerId: effective.providerId, modelId: effective.modelId };
}

function assertToolCall(assertion, input) {
  const projected = collectObjects(input.projection, (item) => item.kind === 'tool_call')
    .map((item) => item.payload?.toolCall)
    .filter((item) => item?.name === assertion.name);
  const receipts = input.facts.receipts.tools.items.filter((item) => item.name === assertion.name);
  if (assertion.status === 'absent') {
    if (projected.length > 0 || receipts.length > 0) {
      throw new Error(`Desktop Agent forbidden Tool call observed: ${assertion.name}`);
    }
    return { name: assertion.name, status: 'absent' };
  }
  const expectedReceiptStatus = assertion.status === 'success' ? 'success' : 'error';
  const receipt = receipts.find((item) => item.status === expectedReceiptStatus);
  const toolCall = projected.find((item) =>
    assertion.status === 'success' ? item.result?.success === true : item.result?.success === false,
  );
  if (!receipt || !toolCall) {
    throw new Error(`Desktop Agent Tool call ${assertion.name} did not reach ${assertion.status}.`);
  }
  if (
    assertion.expectedArguments !== undefined &&
    !containsExpectedValue(toolCall.arguments, assertion.expectedArguments)
  ) {
    throw new Error(`Desktop Agent Tool call ${assertion.name} arguments did not match.`);
  }
  if (
    assertion.resultIncludes !== undefined &&
    !containsExpectedValue(toolCall.result?.data, assertion.resultIncludes)
  ) {
    throw new Error(`Desktop Agent Tool call ${assertion.name} result did not match.`);
  }
  return { id: toolCall.id, name: toolCall.name, status: assertion.status };
}

function assertCancellation(assertion, workflow) {
  const receipt = workflow.receipts[assertion.stepId];
  if (receipt?.accepted !== assertion.accepted || !receipt.identity) {
    throw new Error(`Desktop Agent cancellation evidence is unavailable: ${assertion.stepId}`);
  }
  return { stepId: assertion.stepId, accepted: receipt.accepted, identity: receipt.identity };
}

function assertRecovery(assertion, workflow) {
  const entries = Object.entries(workflow.receipts);
  const resumeIndex = entries.findIndex(([id]) => id === assertion.resumeStepId);
  const submitIndex = entries.findIndex(([id]) => id === assertion.submitStepId);
  const idleIndex = entries.findIndex(([id]) => id === assertion.idleStepId);
  if (
    resumeIndex < 0 ||
    submitIndex <= resumeIndex ||
    idleIndex <= submitIndex ||
    entries[resumeIndex]?.[1]?.snapshot === undefined ||
    entries[submitIndex]?.[1]?.accepted !== true ||
    entries[idleIndex]?.[1]?.identity === undefined
  ) {
    throw new Error(
      'Desktop Agent recovery steps did not resume, submit and return to idle in order.',
    );
  }
  return {
    resumeStepId: assertion.resumeStepId,
    submitStepId: assertion.submitStepId,
    idleStepId: assertion.idleStepId,
  };
}

function assertConversationPersistence(assertion, input) {
  if (
    assertion.authority !== input.facts.runtimePath.transcript ||
    assertion.catalog !== input.facts.runtimePath.metadata ||
    assertion.recordSource !== input.facts.runtimePath.transcript ||
    input.facts.persistence.checkpoint !== 'observed'
  ) {
    throw new Error('Desktop Agent conversation persistence authorities are unavailable.');
  }
  const resumed = Object.entries(input.workflow.receipts).find(
    ([, receipt]) => receipt?.snapshot !== undefined,
  );
  const restoredMessages = resumed?.[1]?.snapshot?.messages;
  if (!Array.isArray(restoredMessages) || restoredMessages.length < assertion.minRestoredMessages) {
    throw new Error(
      `Desktop Agent restored ${restoredMessages?.length ?? 0} message(s); expected at least ${assertion.minRestoredMessages}.`,
    );
  }
  return {
    resumeStepId: resumed[0],
    resumeStatus: assertion.resumeStatus,
    authority: assertion.authority,
    catalog: assertion.catalog,
    restoredMessageCount: restoredMessages.length,
  };
}

function assertTimelineProjection(assertion, input) {
  const patches = collectObjects(
    input.projection,
    (item) => item.type === 'conversationProjectionPatch',
  ).filter((patch) => patch.conversationId === input.identity.conversationId);
  const terminal = patches.find(
    (patch) =>
      patch.turnId === input.identity.turnId &&
      patch.runId === input.identity.runId &&
      patch.completion?.status === assertion.terminalStatus,
  );
  if (!terminal) throw new Error('Desktop Agent terminal Timeline projection is unavailable.');
  if (assertion.toolName) {
    const tools = collectObjects(patches, (item) => item.kind === 'tool_call').filter(
      (item) => item.payload?.toolCall?.name === assertion.toolName,
    );
    if (tools.length === 0) {
      throw new Error(`Desktop Agent Timeline is missing Tool ${assertion.toolName}.`);
    }
  }
  return {
    conversationId: terminal.conversationId,
    turnId: terminal.turnId,
    runId: terminal.runId,
    projectionVersion: terminal.projectionVersion,
    completionStatus: terminal.completion.status,
  };
}

function assertResourceDisplayProjection(assertion, input) {
  const facts = input.facts;
  const projection = facts.resourceDisplayProjections.items.find(
    (item) =>
      item.projectionKind === assertion.projectionKind &&
      item.status === assertion.status &&
      item.locatorKind === assertion.locatorKind &&
      item.transport === assertion.transport &&
      item.renderTarget === assertion.renderTarget,
  );
  if (!projection) throw new Error('Desktop Agent resource display projection is unavailable.');
  if (projection.conversationId !== facts.identity.conversationId) {
    throw new Error('Desktop Agent resource display projection conversation identity is stale.');
  }
  const expectedToolStatus = assertion.status === 'authorized' ? 'success' : 'error';
  if (
    !facts.receipts.tools.items.some(
      (item) => item.callId === projection.toolCallId && item.status === expectedToolStatus,
    )
  ) {
    throw new Error('Desktop Agent resource display projection Tool identity is unavailable.');
  }
  if (assertion.diagnosticsEmpty && projection.diagnosticCodes.length > 0) {
    throw new Error('Desktop Agent resource display projection contains diagnostics.');
  }
  if (
    assertion.status === 'authorized' &&
    assertion.transport === 'openneko-resource' &&
    (!input.mediaCard || input.openNekoResourceRequestCount < 1)
  ) {
    throw new Error(
      'Desktop Agent authorized resource projection has no package-owned UI evidence.',
    );
  }
  return projection;
}

function assertNoFallback(assertion, input) {
  if (input.facts.runtimePath.forbiddenPathCount !== 0) {
    throw new Error('Desktop Agent forbidden runtime path participated in execution.');
  }
  const projected = JSON.stringify(input.projection);
  const transportFallback = /ResourceRef|resourceRef|neko-media:|opennekomedia:|file:/u.test(
    projected,
  );
  if (transportFallback)
    throw new Error('Desktop Agent public projection used a forbidden fallback.');
  const observed = assertion.forbiddenRefs.filter((ref) => projected.includes(ref));
  if (observed.length > 0) {
    throw new Error(
      `Desktop Agent forbidden fallback reference(s) observed: ${observed.join(', ')}`,
    );
  }
  return { forbiddenRefs: assertion.forbiddenRefs, observedForbiddenRefs: [] };
}

function assertFactsContainNoRenderUrl(facts) {
  const serialized = JSON.stringify(facts);
  if (
    /openneko:\/\/resource\/|neko-media:|opennekomedia:|file:|https?:\/\/(?:127\.0\.0\.1|localhost)/u.test(
      serialized,
    )
  ) {
    throw new Error('Desktop Agent provider/Tool facts contain a render transport URL.');
  }
}

function collectObjects(value, predicate, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (predicate(value)) output.push(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    collectObjects(item, predicate, output);
  }
  return output;
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

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}

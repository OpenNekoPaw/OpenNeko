import {
  assertOrderedWorkflowEvents,
  assertWorkflowQueueState,
} from '../runner/workflow-evidence.mjs';
import { assertAutomationToolResult } from '../runner/automation-tool-evidence.mjs';

const DESKTOP_EVIDENCE_ASSERTION_KINDS = new Set([
  'runtime-errors-empty',
  'fully-idle',
  'canonical-turn',
  'pi-runtime',
  'final-answer',
  'skill',
  'model',
  'model-sequence',
  'interaction-binding',
  'input-invocation',
  'draft-rejection',
  'configuration-update',
  'tool-call',
  'automation-tool-result',
  'process-order',
  'queue-state',
  'cancellation',
  'recovery',
  'conversation-persistence',
  'terminal-idle',
  'timeline-projection',
  'resource-display-projection',
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
    schema: 'neko.agent-eval.desktop-session-facts',
    neutralFacts: input.facts,
    identity: input.identity,
    workflow: input.workflow,
    projection: input.projection,
    snapshot: input.snapshot,
    ...(input.mediaCard === undefined ? {} : { mediaCard: input.mediaCard }),
    ...(input.interaction === undefined ? {} : { interaction: input.interaction }),
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
  const unsupportedProcessEvent = assertions
    .filter((assertion) => assertion.kind === 'process-order')
    .flatMap((assertion) => assertion.events)
    .find((event) => event.kind === 'continuation');
  if (unsupportedProcessEvent) {
    throw configurationError(
      "Desktop Agent process-order event 'continuation' is not supported by the Desktop evidence boundary.",
    );
  }
}

export function isDesktopEvaluationFacts(facts) {
  return facts?.schema === 'neko.agent-eval.desktop-session-facts';
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
    interaction: facts.interaction,
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
    case 'model-sequence':
      return assertModelSequence(assertion, input);
    case 'interaction-binding':
      return assertInteractionBinding(assertion, input);
    case 'input-invocation':
      return assertInputInvocation(assertion, input);
    case 'draft-rejection':
      return assertDraftRejection(assertion, input);
    case 'configuration-update':
      return assertConfigurationUpdate(assertion, input);
    case 'tool-call':
      return assertToolCall(assertion, input);
    case 'automation-tool-result':
      return assertDesktopAutomationToolResult(assertion, input);
    case 'process-order':
      return assertOrderedWorkflowEvents(assertion, readDesktopWorkflowSteps(input.workflow));
    case 'queue-state':
      return assertWorkflowQueueState(assertion, readDesktopWorkflowSteps(input.workflow));
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
    default:
      throw configurationError(
        `Desktop Agent assertion '${assertion.kind}' reached execution without an evidence adapter.`,
      );
  }
}

function assertCanonicalFacts(input) {
  const { facts, identity, authorization } = input;
  if (facts.runtimePath?.runtime === 'dsh-agent') {
    if (
      facts.identity?.conversationId !== identity.conversationId ||
      facts.identity?.dshSessionId !== identity.dshSessionId ||
      facts.identity?.turn !== identity.turn
    ) {
      throw new Error('DSH terminal facts identity is stale or mismatched.');
    }
    if (facts.persistence?.checkpoint !== 'observed' || facts.disposal?.status !== 'disposed') {
      throw new Error('DSH persistence or disposal facts are incomplete.');
    }
    if ((facts.diagnostics?.droppedCount ?? 0) !== 0) {
      throw new Error('DSH diagnostic facts were truncated.');
    }
    assertFactsContainNoRenderUrl(facts);
    return;
  }
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
    facts.runtimePath.projection !== 'conversation-projection-store'
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
  if (input.facts.runtimePath?.runtime === 'dsh-agent') {
    if (input.facts.projection?.currentTurn !== undefined) {
      throw new Error('DSH Desktop Session still has an active turn.');
    }
    return { fullyIdle: true, terminalState: 'completed' };
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

function assertModelSequence(assertion, input) {
  const observed = assertion.turns.map((turn) => {
    const receipt = input.workflow.receipts[turn.idleStepId];
    const facts = receipt?.facts;
    const profile = input.executionCase.modelProfiles.find(
      (candidate) => candidate.id === turn.profileId,
    );
    if (!facts || !profile) {
      throw new Error(`Desktop Agent model sequence evidence is unavailable: ${turn.idleStepId}`);
    }
    const effective = facts.configuration?.effective?.values?.modelBinding;
    if (
      profile.selection === 'explicit' &&
      (effective?.providerId !== profile.chat.providerId ||
        effective?.modelId !== profile.chat.modelId)
    ) {
      throw new Error(`Desktop Agent turn ${turn.idleStepId} used an unexpected model binding.`);
    }
    if (
      facts.identity?.conversationId !== input.identity.conversationId ||
      facts.identity?.turnId !== receipt.identity?.turnId ||
      facts.identity?.runId !== receipt.identity?.runId
    ) {
      throw new Error(`Desktop Agent turn ${turn.idleStepId} facts identity is stale.`);
    }
    return {
      idleStepId: turn.idleStepId,
      profileId: profile.id,
      providerId: effective?.providerId,
      modelId: effective?.modelId,
      turnId: facts.identity.turnId,
      runId: facts.identity.runId,
    };
  });
  if (new Set(observed.map((item) => item.turnId)).size !== observed.length) {
    throw new Error('Desktop Agent model sequence did not preserve distinct Turn identities.');
  }
  return { conversationId: input.identity.conversationId, turns: observed };
}

function assertInteractionBinding(assertion, input) {
  const initial = input.interaction?.initial;
  const final = input.interaction?.final;
  if (
    initial?.phase !== assertion.initialPhase ||
    initial?.bindingKind !== assertion.initialBindingKind ||
    final?.phase !== assertion.finalPhase ||
    final?.bindingKind !== assertion.finalBindingKind ||
    final?.conversationId !== input.identity.conversationId ||
    initial?.draftId !== final?.draftId
  ) {
    throw new Error('Desktop Agent Draft-to-Session binding evidence does not match.');
  }
  const ownerMatches =
    final.bindingKind === 'assistant'
      ? final.assistantSpaceId === input.facts.identity.connection.assistantSpaceId &&
        !('projectId' in input.facts.identity.connection)
      : final.workspaceId === input.facts.identity.connection.workspaceId &&
        typeof input.facts.identity.connection.projectId === 'string';
  if (!ownerMatches) {
    throw new Error('Desktop Agent Session connection does not match the exact final binding.');
  }
  return {
    draftId: initial.draftId,
    conversationId: final.conversationId,
    initialBindingKind: initial.bindingKind,
    finalBindingKind: final.bindingKind,
  };
}

function assertInputInvocation(assertion, input) {
  const receipt = input.workflow.receipts[assertion.stepId];
  if (
    receipt?.accepted !== true ||
    receipt.trigger !== assertion.trigger ||
    receipt.name !== assertion.name ||
    receipt.result?.conversationId !== input.identity.conversationId
  ) {
    throw new Error(`Desktop Agent input invocation evidence is unavailable: ${assertion.stepId}`);
  }
  return {
    stepId: assertion.stepId,
    trigger: receipt.trigger,
    name: receipt.name,
    status: assertion.status,
    resultType: receipt.result.type,
  };
}

function assertDraftRejection(assertion, input) {
  const receipt = input.workflow.receipts[assertion.stepId];
  const before = receipt?.surfaceBefore;
  const after = receipt?.surfaceAfter;
  if (
    receipt?.accepted !== false ||
    receipt.status !== 'rejected' ||
    receipt.catalogRef !== assertion.catalogRef ||
    receipt.initialBindingKind !== assertion.initialBindingKind ||
    receipt.currentBindingKind !== assertion.currentBindingKind ||
    receipt.conversationCreated !== false ||
    before?.phase !== 'draft' ||
    after?.phase !== 'draft' ||
    before?.bindingKind !== assertion.surfaceBindingKind ||
    after?.bindingKind !== assertion.surfaceBindingKind ||
    before?.draftId !== after?.draftId ||
    'conversationId' in before ||
    'conversationId' in after
  ) {
    throw new Error(`Desktop Agent Draft rejection evidence is unavailable: ${assertion.stepId}`);
  }
  if (!receipt.diagnosticMessage.includes(assertion.messageIncludes)) {
    throw new Error('Desktop Agent Draft rejection diagnostic does not match.');
  }
  if (
    assertion.availabilityCode !== undefined &&
    receipt.availability?.diagnostic?.code !== assertion.availabilityCode
  ) {
    throw new Error('Desktop Agent Draft input availability diagnostic does not match.');
  }
  return {
    stepId: assertion.stepId,
    draftId: after.draftId,
    catalogRef: assertion.catalogRef,
    initialBindingKind: receipt.initialBindingKind,
    currentBindingKind: receipt.currentBindingKind,
    surfaceBindingKind: after.bindingKind,
    conversationCreated: false,
    diagnosticMessage: receipt.diagnosticMessage,
    ...(receipt.availability?.diagnostic?.code === undefined
      ? {}
      : { availabilityCode: receipt.availability.diagnostic.code }),
  };
}

function assertConfigurationUpdate(assertion, input) {
  const receipt = input.workflow.receipts[assertion.stepId];
  if (
    receipt?.status !== assertion.status ||
    receipt.providerId !== assertion.providerId ||
    receipt.modelId !== assertion.modelId ||
    receipt.turnStateAtUpdate !== assertion.turnState ||
    receipt.conversationId !== input.identity.conversationId ||
    receipt.submissionCountBefore !== receipt.submissionCountAfter
  ) {
    throw new Error(
      `Desktop Agent configuration update evidence is unavailable: ${assertion.stepId}`,
    );
  }
  if (assertion.status === 'applied') {
    const requested = receipt.projection?.request;
    const effective = receipt.projection?.fields?.model?.effectiveValue;
    if (
      receipt.accepted !== true ||
      requested?.providerId !== assertion.providerId ||
      requested?.modelId !== assertion.modelId ||
      effective?.providerId !== assertion.providerId ||
      effective?.modelId !== assertion.modelId
    ) {
      throw new Error('Desktop Agent applied configuration lacks requested/effective evidence.');
    }
  } else if (
    receipt.accepted !== false ||
    typeof receipt.diagnosticMessage !== 'string' ||
    receipt.diagnosticMessage.trim().length === 0
  ) {
    throw new Error('Desktop Agent rejected configuration lacks a diagnostic.');
  }
  return {
    stepId: assertion.stepId,
    status: assertion.status,
    providerId: receipt.providerId,
    modelId: receipt.modelId,
    conversationId: receipt.conversationId,
    turnState: receipt.turnStateAtUpdate,
    turnCreated: false,
    ...(receipt.diagnosticMessage === undefined
      ? {}
      : { diagnosticMessage: receipt.diagnosticMessage }),
  };
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

function assertDesktopAutomationToolResult(assertion, input) {
  const projected = collectObjects(input.projection, (item) => item.kind === 'tool_call')
    .map((item) => item.payload?.toolCall)
    .filter((item) => item?.name === assertion.name && item.result?.success === true);
  const receipts = input.facts.receipts.tools.items.filter(
    (item) => item.name === assertion.name && item.status === 'success',
  );
  if (projected.length !== 1 || receipts.length !== 1) {
    throw new Error(
      `Desktop Agent Automation Tool ${assertion.name} requires one successful terminal result.`,
    );
  }
  return assertAutomationToolResult(assertion, projected[0].result?.data);
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

function readDesktopWorkflowSteps(workflow) {
  if (!Array.isArray(workflow.steps)) {
    throw new Error('Desktop Agent workflow controller trace is unavailable.');
  }
  return workflow.steps.map((step) => ({
    ...step,
    ...(step.snapshot === undefined
      ? {}
      : { snapshot: normalizeDesktopWorkflowSnapshot(step.snapshot) }),
  }));
}

function normalizeDesktopWorkflowSnapshot(snapshot) {
  const timeline = collectProjectionTimeline(snapshot.projectionEvents);
  const toolCalls = timeline
    .filter((item) => item.kind === 'tool')
    .map((item) => ({ name: item.toolName, status: item.status }));
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const turns = messages.map((message) => ({
    ...message,
    ...(message?.role === 'user' && message.source === undefined ? { source: 'user' } : {}),
  }));
  if (timeline.length > 0 || toolCalls.length > 0) {
    turns.push({ role: 'assistant', toolCalls, timeline });
  }
  return {
    conversationId: snapshot.conversationId,
    messageQueue: snapshot.messageQueue,
    turns,
    continuations: [],
  };
}

function collectProjectionTimeline(events) {
  const items = collectObjects(
    Array.isArray(events) ? events : [],
    (item) => item.kind === 'assistant_text' || item.kind === 'tool_call',
  );
  const byIdentity = new Map();
  for (const item of items) {
    const identity = `${item.turnId ?? ''}\u0000${item.id ?? item.itemId ?? ''}`;
    const existing = byIdentity.get(identity);
    const projected =
      item.kind === 'assistant_text'
        ? {
            kind: 'assistant_text',
            sequence: item.sequence,
            content: item.payload?.content ?? item.content ?? '',
          }
        : {
            kind: 'tool',
            sequence: item.sequence,
            toolName: item.payload?.toolCall?.name,
            status: projectToolStatus(item.payload?.toolCall),
          };
    if (!existing || projected.status !== undefined) byIdentity.set(identity, projected);
  }
  return [...byIdentity.values()].sort(
    (left, right) => (left.sequence ?? 0) - (right.sequence ?? 0),
  );
}

function projectToolStatus(toolCall) {
  if (toolCall?.result?.success === true) return 'success';
  if (toolCall?.result?.success === false) return 'error';
  if (toolCall?.pendingConfirmation === true) return 'pending';
  return undefined;
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

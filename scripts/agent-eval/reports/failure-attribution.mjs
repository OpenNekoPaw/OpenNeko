import { SCHEMAS, validateFailureAttribution } from '../schemas/contracts.mjs';

export function createFailureAttribution(input) {
  const observedFailures = [];
  const sources = [];
  for (const gate of input.hardGates ?? []) {
    if (gate.status === 'pass') continue;
    const id = `gate-${gate.id}`;
    observedFailures.push({
      id,
      kind: 'hard-gate',
      summary: gate.message ?? `Hard gate ${gate.id} did not pass.`,
      evidenceRefs: gate.evidenceRefs,
    });
    sources.push({ id, sourceKind: gate.kind ?? gate.id, evidenceRefs: gate.evidenceRefs });
  }
  if (input.executionError) {
    observedFailures.push({
      id: 'execution-failure',
      kind: 'execution',
      summary: formatError(input.executionError),
      evidenceRefs: ['turn-facts'],
    });
    sources.push({
      id: 'execution-failure',
      sourceKind: readErrorCode(input.executionError),
      evidenceRefs: ['turn-facts'],
    });
  }
  if (input.judgeError) {
    observedFailures.push({
      id: 'judge-failure',
      kind: 'judge',
      summary: formatError(input.judgeError),
      evidenceRefs: ['judge.result'],
    });
    sources.push({
      id: 'judge-failure',
      sourceKind: readErrorCode(input.judgeError) === 'execution' ? 'quality' : readErrorCode(input.judgeError),
      evidenceRefs: ['judge.result'],
    });
  }
  if (observedFailures.length === 0) return undefined;
  const hypotheses = sources.map((source) => {
    const hypothesis = hypothesize(source.sourceKind);
    return {
      observedFailureId: source.id,
      suspectedOwner: hypothesis.owner,
      confidence: hypothesis.confidence,
      evidenceRefs: source.evidenceRefs,
      missingEvidence: hypothesis.missingEvidence,
      handoffRecommendation: hypothesis.handoff,
    };
  });
  return validateFailureAttribution({
    schema: SCHEMAS.failureAttribution,
    reportId: input.reportId,
    observedFailures,
    hypotheses,
  });
}

function hypothesize(kind) {
  if (kind === 'skill') {
    return hypothesis('skill-content', 0.65, 'Skill composition and output delta.', 'Review Skill content and prompt composition evidence.');
  }
  if (kind === 'model') {
    return hypothesis('routing', 0.75, 'Requested-to-effective routing trace.', 'Review model profile application and provider routing.');
  }
  if (kind === 'tool-call' || kind === 'task-terminal') {
    return hypothesis('capability-tool', 0.65, 'Owning capability diagnostics and Tool result details.', 'Handoff to the owning Capability/Tool maintainer.');
  }
  if (kind === 'artifact' || kind === 'file') {
    return hypothesis('artifact-authoring', 0.7, 'Owning artifact validator diagnostics.', 'Review authoring and validator evidence together.');
  }
  if (kind === 'final-answer' || kind === 'structured-output') {
    return hypothesis('prompt', 0.4, 'Prompt-versus-model controlled comparison.', 'Compare Prompt and model variants before assigning ownership.');
  }
  if (kind === 'judge' || String(kind).startsWith('judge-')) {
    return hypothesis('evaluation-infrastructure', 0.8, 'Judge provider response and parser diagnostic.', 'Review Judge provider availability and output contract.');
  }
  if (kind === 'quality') {
    return hypothesis('prompt', 0.35, 'Controlled Prompt, Skill, and model quality comparison.', 'Run a controlled optimization Evaluation before assigning the quality defect.');
  }
  if (String(kind).includes('provider') || String(kind).includes('timeout')) {
    return hypothesis('provider-infrastructure', 0.7, 'Provider request status and network diagnostic.', 'Retry only after provider infrastructure is healthy.');
  }
  return hypothesis('runtime-session', 0.45, 'Owning runtime trace at the first violated contract.', 'Trace the session/controller path before changing Prompt or Skill content.');
}

function hypothesis(owner, confidence, missingEvidence, handoff) {
  return { owner, confidence, missingEvidence: [missingEvidence], handoff };
}

function readErrorCode(error) {
  return typeof error === 'object' && error && typeof error.code === 'string'
    ? error.code
    : 'execution';
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

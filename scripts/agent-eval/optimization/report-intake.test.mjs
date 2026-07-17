import { describe, expect, it } from 'vitest';
import { SCHEMAS } from '../schemas/contracts.mjs';
import { createOptimizationIntake, routeOptimizationOwnership } from './report-intake.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;

function identity() {
  return {
    name: 'creation-persona',
    source: 'builtin',
    provenance: 'builtin',
    rootId: 'builtin-skills',
    relativePath: 'creation-persona',
    fingerprint: HASH,
  };
}

function result(overrides = {}) {
  return {
    schema: SCHEMAS.result,
    reportId: 'report-creation-persona-failure',
    suiteId: 'skill.creation-persona',
    caseId: 'draft-rain-station-concept',
    runId: 'run-creation-persona-failure',
    outcome: 'case-fail',
    target: { kind: 'skill', identity: identity() },
    repositoryRevision: '0123456789abcdef',
    modelIdentity: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
    effectiveConfiguration: {
      runtimeProfileId: 'markdown',
      modelProfileId: 'configured-default',
      digest: HASH,
    },
    fixtureDigest: HASH,
    command: 'node scripts/agent-eval/protocol-smoke.mjs',
    assertions: [
      { id: 'runtime', status: 'pass', evidenceRefs: ['turn-facts'] },
      {
        id: 'quality-output',
        status: 'fail',
        evidenceRefs: ['turn-facts'],
        message: 'Draft rationale is generic.',
      },
    ],
    artifactRefs: [],
    usage: { latencyMs: 1_000, retries: 0, inputTokens: 100, outputTokens: 200 },
    reportLocations: {
      result: 'skill.creation-persona/case/run/result.json',
      evidence: 'skill.creation-persona/case/run/evidence.json',
      artifactManifest: 'skill.creation-persona/case/run/artifact-manifest.json',
      qualityReport: 'skill.creation-persona/case/run/quality-report.md',
      judge: 'skill.creation-persona/case/run/judge.json',
    },
    skippedStages: ['baseline'],
    residualRisk: ['One case cannot establish general quality.'],
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    schema: SCHEMAS.evidence,
    reportId: 'report-creation-persona-failure',
    items: [
      {
        ref: 'turn-facts',
        kind: 'runtime-fact',
        source: 'session.facts',
        summary: 'Observed a complete final output and Skill identity.',
        complete: true,
        droppedCount: 0,
        data: {
          turns: [{ role: 'assistant', content: 'Public final answer.' }],
          hiddenPrompt: 'MUST_NOT_ENTER_OPTIMIZER',
        },
      },
      {
        ref: 'judge.result',
        kind: 'judge',
        source: 'content-quality-judge',
        summary: 'Judge found weak creative rationale.',
        complete: true,
        data: { reason: 'The output lists choices without explaining their effect.' },
      },
    ],
    redactions: [{ kind: 'hidden-prompt', count: 1 }],
    ...overrides,
  };
}

function attribution(owner = 'skill-content', confidence = 0.9, overrides = {}) {
  return {
    schema: SCHEMAS.failureAttribution,
    reportId: 'report-creation-persona-failure',
    observedFailures: [
      {
        id: 'quality-failure',
        kind: 'quality',
        summary: 'Creative rationale is not connected to concrete decisions.',
        evidenceRefs: ['turn-facts', 'judge.result'],
      },
    ],
    hypotheses: [
      {
        observedFailureId: 'quality-failure',
        suspectedOwner: owner,
        confidence,
        evidenceRefs: ['turn-facts', 'judge.result'],
        missingEvidence: ['A holdout comparison remains required.'],
        handoffRecommendation: 'Evaluate a narrow content candidate.',
      },
    ],
    ...overrides,
  };
}

function judge() {
  return {
    schema: SCHEMAS.judge,
    reportId: 'report-creation-persona-failure',
    suiteId: 'skill.creation-persona',
    caseId: 'draft-rain-station-concept',
    runId: 'run-creation-persona-failure',
    providerId: 'openai',
    modelId: 'gpt-5-mini',
    profileId: 'content-quality-judge',
    rubricId: 'rain-station-draft-quality',
    rubricVersion: 'v1',
    promptHash: HASH,
    sampling: { temperature: 0, maxTokens: 1_800 },
    criteria: [
      {
        criterionId: 'creative-rationale',
        score: 2.5,
        evidenceRefs: ['turn-facts'],
        reason: 'The rationale does not connect choices to audience effect.',
        uncertainty: 0.1,
      },
    ],
    overallScore: 2.5,
    uncertainty: 0.1,
    summary: 'The Draft needs more causal creative reasoning.',
    disposition: 'eligible',
    usage: { inputTokens: 200, outputTokens: 100 },
  };
}

function skillTarget() {
  return {
    kind: 'skill-content',
    identity: identity(),
    targetFile: 'packages/neko-skills/src/builtins/creation-persona.ts',
  };
}

function intake(overrides = {}) {
  return createOptimizationIntake({
    result: result(overrides.result),
    evidence: evidence(overrides.evidence),
    failureAttribution: attribution(
      overrides.owner ?? 'skill-content',
      overrides.confidence ?? 0.9,
      overrides.attribution,
    ),
    judge: judge(),
  });
}

describe('optimization report intake', () => {
  it('projects sanitized evidence and preserves fact, owner, confidence and missing evidence', () => {
    const projected = intake();
    expect(projected.reportId).toBe('report-creation-persona-failure');
    expect(projected.rubricDimensions).toEqual([
      {
        id: 'creative-rationale',
        score: 2.5,
        evidenceRefs: ['turn-facts'],
        uncertainty: 0.1,
      },
    ]);
    expect(projected.hypotheses[0]).toMatchObject({
      suspectedOwner: 'skill-content',
      confidence: 0.9,
      missingEvidence: ['A holdout comparison remains required.'],
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('MUST_NOT_ENTER_OPTIMIZER');
    expect(serialized).not.toContain('Public final answer.');
  });

  it('rejects mismatched reports and unavailable evidence refs', () => {
    expect(() =>
      createOptimizationIntake({
        result: result(),
        evidence: evidence({ reportId: 'report-other' }),
        failureAttribution: attribution(),
        judge: judge(),
      }),
    ).toThrow('does not match');
    const invalidAttribution = attribution();
    invalidAttribution.hypotheses[0].evidenceRefs = ['missing-ref'];
    expect(() =>
      createOptimizationIntake({
        result: result(),
        evidence: evidence(),
        failureAttribution: invalidAttribution,
        judge: judge(),
      }),
    ).toThrow('unavailable evidence');
  });
});

describe('optimization ownership gate', () => {
  it('allows a confirmed Skill-content defect to propose only the matching Host target', () => {
    const routed = routeOptimizationOwnership(intake(), skillTarget());
    expect(routed).toMatchObject({
      disposition: 'candidate-eligible',
      target: skillTarget(),
      ownership: { suspectedOwner: 'skill-content', confidence: 0.9 },
    });
    expect(() =>
      routeOptimizationOwnership(intake(), {
        ...skillTarget(),
        identity: { ...identity(), fingerprint: `sha256:${'b'.repeat(64)}` },
      }),
    ).toThrow('differs from the report target');
  });

  it.each([
    ['capability-tool', 'handoff'],
    ['runtime-session', 'handoff'],
    ['provider-infrastructure', 'handoff'],
    ['artifact-authoring', 'handoff'],
    ['evaluation-infrastructure', 'handoff'],
  ])('routes %s failures to the canonical owner', (owner, disposition) => {
    expect(routeOptimizationOwnership(intake({ owner }), skillTarget())).toMatchObject({
      disposition,
      canonicalOwner: owner,
      suspectedOwner: owner,
    });
  });

  it('blocks infrastructure, incomplete evidence, low confidence and ambiguous attribution', () => {
    expect(
      routeOptimizationOwnership(
        intake({
          owner: 'provider-infrastructure',
          result: { outcome: 'infrastructure-fail' },
        }),
        skillTarget(),
      ),
    ).toMatchObject({ disposition: 'blocked' });

    expect(
      routeOptimizationOwnership(
        intake({
          evidence: {
            items: evidence().items.map((item) =>
              item.ref === 'turn-facts' ? { ...item, complete: false, droppedCount: 2 } : item,
            ),
          },
        }),
        skillTarget(),
      ),
    ).toMatchObject({ disposition: 'blocked', canonicalOwner: 'evaluation-infrastructure' });

    expect(routeOptimizationOwnership(intake({ confidence: 0.5 }), skillTarget())).toMatchObject({
      disposition: 'blocked',
    });

    const ambiguous = attribution();
    ambiguous.hypotheses.push({
      ...ambiguous.hypotheses[0],
      suspectedOwner: 'runtime-session',
      confidence: 0.85,
    });
    expect(
      routeOptimizationOwnership(intake({ attribution: ambiguous }), skillTarget()),
    ).toMatchObject({ disposition: 'blocked' });
  });

  it('requires independent evidence before optimizing Prompt routing', () => {
    const promptResult = result({
      target: { kind: 'prompt', id: 'base-prompt', contractHash: HASH },
    });
    const routingIntake = createOptimizationIntake({
      result: promptResult,
      evidence: evidence(),
      failureAttribution: attribution('routing', 0.95),
      judge: judge(),
    });
    const target = {
      kind: 'prompt-routing',
      promptId: 'base-prompt',
      contractHash: HASH,
      targetFile: 'packages/neko-agent/packages/agent/src/prompt/system-prompt-composer.ts',
    };
    expect(routeOptimizationOwnership(routingIntake, target)).toMatchObject({
      disposition: 'blocked',
    });
    expect(
      routeOptimizationOwnership(routingIntake, target, {
        routingConfirmationEvidenceRefs: ['judge.result'],
      }),
    ).toMatchObject({ disposition: 'candidate-eligible' });
  });

  it('allows a confirmed Prompt-guidance defect without authorizing runtime changes', () => {
    const promptIntake = createOptimizationIntake({
      result: result({ target: { kind: 'prompt', id: 'base-prompt', contractHash: HASH } }),
      evidence: evidence(),
      failureAttribution: attribution('prompt', 0.85),
      judge: judge(),
    });
    expect(
      routeOptimizationOwnership(promptIntake, {
        kind: 'prompt-guidance',
        promptId: 'base-prompt',
        contractHash: HASH,
        targetFile: 'packages/neko-agent/packages/agent/src/prompt/system-prompt-composer.ts',
      }),
    ).toMatchObject({
      disposition: 'candidate-eligible',
      ownership: { suspectedOwner: 'prompt' },
    });
    expect(
      routeOptimizationOwnership(promptIntake, {
        kind: 'prompt-routing',
        promptId: 'base-prompt',
        contractHash: HASH,
        targetFile: 'packages/neko-agent/packages/agent/src/prompt/system-prompt-composer.ts',
      }),
    ).toMatchObject({ disposition: 'handoff' });
  });
});

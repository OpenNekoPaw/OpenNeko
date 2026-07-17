import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import {
  CASE_GROUPS,
  SCHEMAS,
  validateArtifactManifest,
  validateAuthoringDecision,
  validateBaseline,
  validateComparison,
  validateEvidence,
  validateResult,
  validateRubricDefinition,
  validateScenario,
  validateScenarioForExecution,
  validateSuite,
} from './contracts.mjs';
import {
  EVIDENCE_ALLOWLISTS,
  RAW_RETENTION_POLICY,
  assertShareableEvidence,
} from './evidence-policy.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function evidenceContract() {
  return {
    userBehavior: 'Submit a prompt and receive one final answer through the canonical TUI path.',
    canonicalPath: ['TUI App owner', 'input queue', 'AgentSession', 'facts'],
    forbiddenFallback: ['direct Agent turn runner'],
    observables: [
      {
        ref: 'turn-facts',
        kind: 'runtime-fact',
        description: 'Canonical turn and final answer facts.',
        required: true,
      },
    ],
    expectedResult: 'The canonical turn reaches fully idle with a final answer.',
    expectedFailure: 'Missing path facts or runtime errors fail visibly.',
  };
}

function coverageDelta() {
  return {
    schema: SCHEMAS.coverageDelta,
    behaviorId: 'single-turn',
    groups: CASE_GROUPS.map((group) =>
      group === 'canonical'
        ? { group, disposition: 'required' }
        : { group, disposition: 'not-applicable', reason: `${group} is outside this pilot.` },
    ),
  };
}

function target() {
  return { kind: 'runtime', id: 'single-turn', contractHash: HASH };
}

function suite() {
  return {
    schema: SCHEMAS.suite,
    id: 'agent-runtime.single-turn',
    owner: { kind: 'agent-runtime', id: 'session-runtime' },
    target: target(),
    repositoryRevision: 'test-revision',
    runtimeProfiles: [{ id: 'default', settings: { temperature: 0.7 }, configurationHash: HASH }],
    modelProfiles: [
      {
        id: 'chat-default',
        selection: 'explicit',
        chat: { providerId: 'openai', modelId: 'org/model-v1' },
        configurationHash: HASH_B,
      },
    ],
    judgeProfiles: [],
    fixtures: [
      {
        id: 'empty-workspace',
        root: 'fixtures/empty',
        source: 'repository',
        digest: HASH,
        mutable: true,
      },
    ],
    cases: [
      {
        id: 'canonical-answer',
        file: 'cases/canonical-answer.json',
        group: 'canonical',
        visibility: 'public',
      },
    ],
    rubricRefs: [],
    baselinePolicy: { mode: 'none' },
    reportPolicy: {
      rawRetentionDays: 14,
      trustedCiRetentionDays: 14,
      committedSummary: true,
      includeHistory: false,
    },
  };
}

function scenario() {
  return {
    schema: SCHEMAS.scenario,
    id: 'canonical-answer',
    suiteId: 'agent-runtime.single-turn',
    caseGroup: 'canonical',
    visibility: 'public',
    evidenceContract: evidenceContract(),
    fixtureRefs: ['empty-workspace'],
    runtimeProfileId: 'default',
    modelProfileIds: ['chat-default'],
    steps: [
      { id: 'submit', kind: 'submit', prompt: 'Return a concise answer.' },
      { id: 'idle', kind: 'wait-for-idle', timeoutMs: 120_000 },
    ],
    assertions: [
      { id: 'runtime', kind: 'runtime-errors-empty', evidenceRef: 'turn-facts' },
      { id: 'idle', kind: 'fully-idle', evidenceRef: 'turn-facts' },
      { id: 'turn', kind: 'canonical-turn', evidenceRef: 'turn-facts' },
      { id: 'answer', kind: 'final-answer', mode: 'non-empty', evidenceRef: 'turn-facts' },
    ],
    artifactChecks: [],
    budget: { timeoutMs: 120_000, repetitions: 1 },
  };
}

describe('agent evaluation v2 strict authoring contracts', () => {
  it('accepts a complete create decision and rejects invalid decision fields', () => {
    const decision = {
      schema: SCHEMAS.authoringDecision,
      behaviorId: 'single-turn',
      decision: 'create',
      proposedSuiteId: 'agent-runtime.single-turn',
      target: target(),
      userBehavior: 'Receive an answer through the complete TUI runtime.',
      evidenceContract: evidenceContract(),
      coverageDelta: coverageDelta(),
    };
    expect(validateAuthoringDecision(decision)).toBe(decision);
    expect(() => validateAuthoringDecision({ ...decision, decision: 'guess' })).toThrow(
      'does not match any supported variant',
    );
    expect(() => validateAuthoringDecision({ ...decision, suiteId: 'wrong-field' })).toThrow(
      'unknown field',
    );
  });

  it.each([
    ['reuse', {}],
    ['update', {}],
    ['create', {}],
    ['excluded', {}],
  ])('rejects incomplete %s decisions', (decisionKind, decisionFields) => {
    expect(() =>
      validateAuthoringDecision({
        schema: SCHEMAS.authoringDecision,
        behaviorId: 'single-turn',
        decision: decisionKind,
        ...decisionFields,
        target: target(),
        userBehavior: 'Receive an answer through the complete TUI runtime.',
        evidenceContract: evidenceContract(),
        coverageDelta: coverageDelta(),
      }),
    ).toThrow('does not match any supported variant');
  });

  it('requires every coverage group exactly once', () => {
    const decision = {
      schema: SCHEMAS.authoringDecision,
      behaviorId: 'single-turn',
      decision: 'create',
      proposedSuiteId: 'agent-runtime.single-turn',
      target: target(),
      userBehavior: 'Receive an answer through the complete TUI runtime.',
      evidenceContract: evidenceContract(),
      coverageDelta: coverageDelta(),
    };
    decision.coverageDelta.groups[8] = {
      group: 'canonical',
      disposition: 'not-applicable',
      reason: 'duplicate for rejection',
    };
    expect(() => validateAuthoringDecision(decision)).toThrow('every case group exactly once');
  });

  it('enforces Host-owned Skill identity and fingerprint semantics', () => {
    const value = suite();
    value.owner = { kind: 'skill', id: 'storyboard' };
    value.target = {
      kind: 'skill',
      identity: {
        name: 'storyboard',
        source: 'project',
        provenance: 'workspace',
        rootId: 'project-agent-skills',
        relativePath: 'storyboard',
        fingerprint: HASH,
      },
    };
    expect(validateSuite(value)).toBe(value);
    value.target.identity.relativePath = 'renamed-storyboard';
    expect(() => validateSuite(value)).toThrow('must equal the relativePath directory name');
  });
});

describe('agent evaluation v2 suite and scenario contracts', () => {
  it('accepts a strict suite and executable M1 scenario', () => {
    expect(validateSuite(suite())).toEqual(suite());
    expect(validateScenarioForExecution(scenario())).toEqual(scenario());
  });

  it('accepts supported workflow steps and rejects invalid references before execution', () => {
    const workflow = scenario();
    workflow.steps = [
      { id: 'submit', kind: 'submit', prompt: 'Create a draft.' },
      { id: 'queue', kind: 'queue', prompt: 'Review it.', afterStepId: 'submit' },
      { id: 'idle', kind: 'wait-for-idle', timeoutMs: 120_000 },
      {
        id: 'idle-continuation',
        kind: 'submit',
        prompt: 'Continue after an idle interval.',
        delayMs: 35_000,
      },
      { id: 'idle-continuation-idle', kind: 'wait-for-idle', timeoutMs: 120_000 },
      {
        id: 'feedback',
        kind: 'feedback',
        prompt: 'Revise: ${lastAssistant}',
        afterStepId: 'idle-continuation-idle',
      },
      { id: 'cancel', kind: 'cancel', afterStepId: 'feedback' },
      { id: 'cancel-idle', kind: 'wait-for-idle', timeoutMs: 120_000 },
      { id: 'resume', kind: 'resume', conversationRef: 'current' },
      { id: 'final-idle', kind: 'wait-for-idle', timeoutMs: 120_000 },
    ];
    expect(validateScenarioForExecution(workflow)).toBe(workflow);

    const forwardReference = scenario();
    forwardReference.steps = [
      { id: 'queue', kind: 'queue', prompt: 'Review it.', afterStepId: 'submit' },
      { id: 'submit', kind: 'submit', prompt: 'Create a draft.' },
    ];
    expect(() => validateScenarioForExecution(forwardReference)).toThrow('earlier step');

    const staticFeedback = scenario();
    staticFeedback.steps.push({
      id: 'feedback',
      kind: 'feedback',
      prompt: 'Static retry.',
      afterStepId: 'idle',
    });
    expect(() => validateScenarioForExecution(staticFeedback)).toThrow('${lastAssistant}');

    const submitWhileActive = scenario();
    submitWhileActive.steps.splice(1, 0, {
      id: 'second-submit',
      kind: 'submit',
      prompt: 'This must be a queue step.',
    });
    expect(() => validateScenarioForExecution(submitWhileActive)).toThrow('use queue');

    const noTerminalIdle = scenario();
    noTerminalIdle.steps.pop();
    expect(() => validateScenarioForExecution(noTerminalIdle)).toThrow('end with wait-for-idle');
  });

  it('rejects unknown schema versions, fields, and kinds', () => {
    expect(() => validateSuite({ ...suite(), schema: 'neko.agent-eval.suite.v3' })).toThrow(
      'must equal "neko.agent-eval.suite.v2"',
    );
    expect(() => validateSuite({ ...suite(), metadata: { ignored: true } })).toThrow(
      'unknown field(s): metadata',
    );
    const invalid = scenario();
    invalid.steps = [{ id: 'submit', kind: 'teleport', prompt: 'ignored' }];
    expect(() => validateScenario(invalid)).toThrow('does not match any supported variant');
  });

  it('rejects the committed unsupported-field pilot as configuration invalid', async () => {
    const fixture = JSON.parse(
      await fs.readFile(
        'scripts/agent-eval/test-fixtures/v2/unsupported-field.scenario.json',
        'utf8',
      ),
    );
    expect(() => validateScenario(fixture)).toThrow('unknown field(s): metadataOnlyJudge');
  });

  it('rejects unsafe fixture, case, artifact, and report paths', () => {
    for (const root of ['/Users/example/private', '../escape', '~/private']) {
      const invalid = suite();
      invalid.fixtures[0].root = root;
      expect(() => validateSuite(invalid)).toThrow(/portable relative path|traversal segments/u);
    }
    const invalidCase = suite();
    invalidCase.cases[0].file = 'cases/../private.json';
    expect(() => validateSuite(invalidCase)).toThrow('traversal segments');
  });

  it('requires an executable evidence contract and declared evidence refs', () => {
    const missing = scenario();
    delete missing.evidenceContract;
    expect(() => validateScenario(missing)).toThrow('missing required field(s): evidenceContract');

    const undeclared = scenario();
    undeclared.assertions[0].evidenceRef = 'metadata-only';
    expect(() => validateScenario(undeclared)).toThrow('references undeclared evidence');

    const noRequiredEvidence = scenario();
    noRequiredEvidence.evidenceContract.observables[0].required = false;
    expect(() => validateScenario(noRequiredEvidence)).toThrow('at least one required observable');
  });

  it('rejects unavailable artifact validators and accepts the executable Judge kind', () => {
    const withArtifact = scenario();
    withArtifact.artifactChecks = [
      {
        id: 'artifact',
        kind: 'file',
        evidenceRef: 'turn-facts',
        path: 'output/result.json',
        digest: HASH,
        validatorId: 'json-validator',
      },
    ];
    expect(() => validateScenarioForExecution(withArtifact)).toThrow(
      'unsupported public artifact validator json-validator',
    );

    const withJudge = scenario();
    withJudge.rubric = {
      kind: 'domain-rubric',
      ref: 'rubrics/answer-quality.json',
      judgeProfileId: 'judge-default',
    };
    expect(validateScenarioForExecution(withJudge)).toBe(withJudge);
  });

  it('accepts every executable M2 typed-fact assertion and rejects unsupported Skill states', () => {
    const executable = scenario();
    executable.assertions = [
      {
        id: 'skill',
        kind: 'skill',
        identity: {
          name: 'storyboard',
          source: 'project',
          provenance: 'workspace',
          rootId: 'project-agent-skills',
          relativePath: 'storyboard',
          fingerprint: HASH,
        },
        status: 'injected',
        evidenceRef: 'turn-facts',
      },
      {
        id: 'model',
        kind: 'model',
        profileId: 'chat-default',
        noFallback: true,
        evidenceRef: 'turn-facts',
      },
      {
        id: 'tool',
        kind: 'tool-call',
        name: 'canvas.create',
        status: 'success',
        evidenceRef: 'turn-facts',
      },
      {
        id: 'task',
        kind: 'task-terminal',
        taskType: 'image-generation',
        status: 'completed',
        evidenceRef: 'turn-facts',
      },
      {
        id: 'artifact',
        kind: 'artifact',
        artifactRef: 'asset:scene-1',
        validatorStatus: 'valid',
        evidenceRef: 'turn-facts',
      },
      {
        id: 'generated-artifact',
        kind: 'artifact',
        artifactKind: 'generated-asset',
        provenanceSource: 'generated-asset',
        validatorStatus: 'valid',
        evidenceRef: 'turn-facts',
      },
      {
        id: 'fallback',
        kind: 'no-fallback',
        forbiddenRefs: ['legacy:skill', 'legacy.tool'],
        evidenceRef: 'turn-facts',
      },
    ];
    expect(validateScenarioForExecution(executable)).toBe(executable);

    executable.assertions[0].status = 'completed';
    expect(() => validateScenarioForExecution(executable)).toThrow(
      'does not match any supported variant',
    );
  });

  it('rejects dynamic artifact validator commands and internal business imports before spawn', () => {
    const dynamic = scenario();
    dynamic.artifactChecks = [
      {
        id: 'artifact',
        kind: 'file',
        evidenceRef: 'turn-facts',
        path: 'output/result.json',
        digest: HASH,
        validatorId: 'json-document-v1',
        validatorModule: '@neko/agent/validation',
      },
    ];
    expect(() => validateScenarioForExecution(dynamic)).toThrow(
      'unknown field(s): validatorModule',
    );

    delete dynamic.artifactChecks[0].validatorModule;
    dynamic.artifactChecks[0].validatorId = 'agent-internal-validator';
    expect(() => validateScenarioForExecution(dynamic)).toThrow(
      'dynamic modules, commands, and target-package imports are forbidden',
    );
  });
});

describe('agent evaluation domain rubric contract', () => {
  it('requires unique criteria whose weights sum to one', () => {
    const rubric = {
      schema: SCHEMAS.rubric,
      id: 'storyboard-quality',
      domain: 'storyboard',
      version: 'v1',
      minimumScore: 4,
      maximumUncertainty: 0.3,
      criteria: [
        { id: 'complete', description: 'Complete.', weight: 0.6, evidenceRefs: ['output'] },
        { id: 'specific', description: 'Specific.', weight: 0.4, evidenceRefs: ['output'] },
      ],
    };
    expect(validateRubricDefinition(rubric)).toBe(rubric);
    rubric.criteria[1].weight = 0.3;
    expect(() => validateRubricDefinition(rubric)).toThrow('weights must sum to 1');
  });
});

describe('agent evaluation v2 report contracts', () => {
  it('validates result, evidence, artifact, baseline, and comparison documents', () => {
    expect(() =>
      validateResult({
        schema: SCHEMAS.result,
        reportId: 'report-1',
        suiteId: 'agent-runtime.single-turn',
        caseId: 'canonical-answer',
        runId: 'run-1',
        outcome: 'pass',
        target: target(),
        repositoryRevision: 'abc123',
        modelIdentity: { providerId: 'openai', modelId: 'org/model-v1' },
        effectiveConfiguration: {
          runtimeProfileId: 'default',
          modelProfileId: 'chat-default',
          digest: HASH,
        },
        fixtureDigest: HASH,
        command: 'node scripts/agent-eval/runner.mjs',
        assertions: [{ id: 'runtime', status: 'pass', evidenceRefs: ['turn-facts'] }],
        artifactRefs: [],
        usage: { latencyMs: 100, retries: 0 },
        reportLocations: {
          result: 'run-1/result.json',
          evidence: 'run-1/evidence.json',
          artifactManifest: 'run-1/artifact-manifest.json',
          qualityReport: 'run-1/quality-report.md',
        },
        skippedStages: ['judge'],
        residualRisk: [],
      }),
    ).not.toThrow();
    expect(() =>
      validateEvidence({
        schema: SCHEMAS.evidence,
        reportId: 'report-1',
        items: [
          {
            ref: 'turn-facts',
            kind: 'runtime-fact',
            source: 'session.facts',
            summary: 'Fully idle.',
            complete: true,
            droppedCount: 0,
          },
        ],
        redactions: [],
      }),
    ).not.toThrow();
    expect(() =>
      validateArtifactManifest({
        schema: SCHEMAS.artifactManifest,
        reportId: 'report-1',
        artifacts: [
          {
            ref: 'output',
            kind: 'file',
            path: 'output/result.json',
            digest: HASH,
            provenance: 'agent-tool',
            deliveryStatus: 'delivered',
            validatorId: 'json-validator',
            validatorStatus: 'valid',
          },
        ],
      }),
    ).not.toThrow();
    const baseline = {
      schema: SCHEMAS.baseline,
      id: 'baseline-1',
      target: target(),
      repositoryRevision: 'abc123',
      fixtureDigest: HASH,
      runtimeProfileId: 'default',
      modelProfileIds: ['chat-default'],
      samplingPolicy: { id: 'single-sample', version: 'v1', digest: HASH },
      budget: { timeoutMs: 120_000, repetitions: 1 },
      validatorPolicy: { id: 'hard-gates', version: 'v1', digest: HASH },
      judgePolicy: { id: 'no-judge', version: 'v1', digest: HASH },
      hardGateIds: ['runtime'],
      scoreDistribution: { samples: 1, passRate: 1, mean: 1, variance: 0 },
      reportId: 'report-1',
      approver: 'evaluation owner',
      approvedAt: '2026-07-13T00:00:00.000Z',
    };
    expect(() => validateBaseline(baseline)).not.toThrow();
    expect(() =>
      validateComparison({
        schema: SCHEMAS.comparison,
        id: 'comparison-1',
        baselineId: 'baseline-1',
        currentReportIds: ['report-2'],
        outcome: 'non-comparable',
        comparable: false,
        dimensions: [{ id: 'fixture', comparable: false, baseline: HASH, current: HASH_B }],
        evidenceRefs: ['fixture-diff'],
        reason: 'Fixture digest differs.',
      }),
    ).not.toThrow();
  });

  it('forbids improvement claims for non-comparable inputs', () => {
    expect(() =>
      validateComparison({
        schema: SCHEMAS.comparison,
        id: 'comparison-1',
        baselineId: 'baseline-1',
        currentReportIds: ['report-2'],
        outcome: 'non-comparable',
        comparable: false,
        dimensions: [{ id: 'fixture', comparable: false, baseline: HASH, current: HASH_B }],
        evidenceRefs: ['fixture-diff'],
        improvementPercent: 20,
      }),
    ).toThrow('must not include improvementPercent');
  });
});

describe('agent evaluation evidence policy', () => {
  it('defines separate raw and committed retention allowlists', () => {
    expect(RAW_RETENTION_POLICY).toMatchObject({
      localReportDirectory: 'reports/agent-eval',
      localRetentionDays: 14,
      trustedCiRetentionDays: 14,
      committedRetention: 'approved-sanitized-only',
    });
    expect(EVIDENCE_ALLOWLISTS.rawReport.committed).toEqual([]);
    expect(EVIDENCE_ALLOWLISTS.committedBaseline.committed).toContain('target-fingerprint');
  });

  it('rejects secrets and machine-specific paths from shareable evidence', () => {
    expect(() =>
      assertShareableEvidence({
        providerId: 'openai',
        fixture: 'fixtures/empty',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    ).not.toThrow();
    expect(() => assertShareableEvidence({ apiKey: 'secret' })).toThrow(
      'not allowed in shareable evidence',
    );
    expect(() => assertShareableEvidence({ accessToken: 'secret' })).toThrow(
      'not allowed in shareable evidence',
    );
    expect(() => assertShareableEvidence({ path: '/Users/example/private.txt' })).toThrow(
      'machine-specific absolute path',
    );
  });
});

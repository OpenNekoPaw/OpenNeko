import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OPTIMIZATION_SCHEMAS } from '../schemas/optimization-contracts.mjs';
import {
  createOpenSpecApplicationHandoff,
  hashOptimizationArtifact,
  writeOptimizationApprovalRecord,
  writeOptimizationCandidateArtifacts,
} from './candidate-artifacts.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const NOW = '2026-07-14T00:00:00.000Z';
const TARGET = 'packages/neko-skills/src/builtins/creation-persona.ts';
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function identity(fingerprint = HASH_A) {
  return {
    name: 'creation-persona',
    source: 'builtin',
    provenance: 'builtin',
    rootId: 'builtin-skills',
    relativePath: 'creation-persona',
    fingerprint,
  };
}

function budget() {
  return {
    maxCandidates: 2,
    maxIterations: 3,
    timeoutMs: 600_000,
    targetTokenLimit: 100_000,
    controllerTokenLimit: 20_000,
    judgeTokenLimit: 30_000,
    costUsdLimit: 20,
    noImprovementLimit: 2,
  };
}

function matrix() {
  return {
    suiteId: 'skill.creation-persona',
    developmentCaseIds: ['draft-rain-station-concept'],
    holdoutPolicy: {
      id: 'creation-persona-holdout-v1',
      selectionDigest: `sha256:${'d'.repeat(64)}`,
      minimumCases: 1,
    },
    protectedRegressionCaseIds: ['reject-apply-execution'],
    runtimeProfileId: 'markdown',
    modelProfileId: 'configured-default',
    repetitions: 3,
    judgeProfileId: 'content-quality-judge',
    rubricRef: 'rubrics/rain-station-draft-quality.json',
  };
}

function plan() {
  return {
    schema: OPTIMIZATION_SCHEMAS.plan,
    id: 'creation-persona-rationale-optimization',
    status: 'proposed',
    target: { kind: 'skill-content', identity: identity(), targetFile: TARGET },
    baseFingerprint: HASH_A,
    reportIds: ['report-quality-regression'],
    failedCases: [
      {
        suiteId: 'skill.creation-persona',
        caseId: 'draft-rain-station-concept',
        reportId: 'report-quality-regression',
        outcome: 'case-fail',
      },
    ],
    rubricDimensions: [{ id: 'creative-rationale', score: 2.5, evidenceRefs: ['failure-1'] }],
    ownership: {
      observedFailure: 'Creative rationale is generic.',
      suspectedOwner: 'skill-content',
      confidence: 0.9,
      evidenceRefs: ['failure-1'],
      missingEvidence: ['Holdout remains required.'],
    },
    expectedImprovement: 'Connect observations, decisions and audience effect.',
    risks: ['The candidate may become verbose.'],
    budget: budget(),
    requiredMatrix: matrix(),
    acceptanceThreshold: { minimumQualityDelta: 0.1, maximumJudgeUncertainty: 0.35 },
    createdBy: 'developer@example.invalid',
    createdAt: NOW,
  };
}

function patch(extra = '') {
  return [
    `diff --git a/${TARGET} b/${TARGET}`,
    `--- a/${TARGET}`,
    `+++ b/${TARGET}`,
    '@@ -1 +1 @@',
    '-old rationale',
    `+new causal rationale${extra}`,
    '',
  ].join('\n');
}

function candidate(patchText = patch(), overrides = {}) {
  return {
    schema: OPTIMIZATION_SCHEMAS.candidate,
    id: 'creation-persona-rationale-candidate-1',
    planId: plan().id,
    target: plan().target,
    baseFingerprint: HASH_A,
    candidateFingerprint: HASH_B,
    patchPath:
      'artifacts/optimization/creation-persona-rationale-optimization/creation-persona-rationale-candidate-1/candidate.patch',
    patchFingerprint: hashOptimizationArtifact(patchText),
    changeSummary: 'Clarify causal creative reasoning.',
    evidenceRefs: ['failure-1'],
    expectedImprovement: 'Improve content-level creative rationale.',
    risks: ['Additional guidance may increase output length.'],
    holdoutAccess: 'not-provided',
    canonicalMutation: false,
    commitRequested: false,
    createdBy: 'optimizer@example.invalid',
    createdAt: NOW,
    ...overrides,
  };
}

function approval(overrides = {}) {
  return {
    schema: OPTIMIZATION_SCHEMAS.approval,
    id: 'approval-creation-persona-candidate-1',
    decision: 'approve',
    planId: plan().id,
    candidateId: candidate().id,
    target: plan().target,
    baseFingerprint: HASH_A,
    candidateFingerprint: HASH_B,
    approver: 'human@example.invalid',
    scope: { targetFiles: [TARGET], allowedSections: ['Rationale'] },
    budget: budget(),
    requiredMatrix: matrix(),
    decidedAt: NOW,
    reason: 'Narrow candidate with protected evaluation coverage.',
    ...overrides,
  };
}

async function workspace() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-optimization-artifacts-'));
  temporaryDirectories.push(root);
  const targetFile = join(root, TARGET);
  await fs.mkdir(join(root, 'packages/neko-skills/src/builtins'), { recursive: true });
  await fs.writeFile(targetFile, 'canonical-content\n');
  return { root, targetFile, outputRoot: join(root, 'artifacts') };
}

describe('optimization candidate artifacts', () => {
  it('writes reviewable artifacts outside canonical content without mutating the target', async () => {
    const work = await workspace();
    const patchText = patch();
    const files = await writeOptimizationCandidateArtifacts(
      { plan: plan(), candidate: candidate(patchText), patchText },
      {
        repositoryRoot: work.root,
        outputRoot: work.outputRoot,
        artifactPathPrefix: 'artifacts',
      },
    );
    expect(await fs.readFile(work.targetFile, 'utf8')).toBe('canonical-content\n');
    expect(await fs.readFile(files.patch, 'utf8')).toBe(patchText);
    expect(await fs.readFile(files.plan, 'utf8')).toContain('Required Evaluation Matrix');
    expect(JSON.parse(await fs.readFile(files.candidate, 'utf8'))).toEqual(candidate(patchText));
  });

  it('rejects fingerprint drift, out-of-scope files, secrets and holdout leakage', async () => {
    const work = await workspace();
    const patchText = patch();
    await expect(
      writeOptimizationCandidateArtifacts(
        {
          plan: plan(),
          candidate: candidate(patchText, { patchFingerprint: HASH_A }),
          patchText,
        },
        { repositoryRoot: work.root, outputRoot: work.outputRoot, artifactPathPrefix: 'artifacts' },
      ),
    ).rejects.toMatchObject({ code: 'candidate-patch-fingerprint-mismatch' });

    const otherPatch = patchText.replaceAll(TARGET, 'packages/neko-skills/src/builtins/other.ts');
    await expect(
      writeOptimizationCandidateArtifacts(
        { plan: plan(), candidate: candidate(otherPatch), patchText: otherPatch },
        { repositoryRoot: work.root, outputRoot: work.outputRoot, artifactPathPrefix: 'artifacts' },
      ),
    ).rejects.toMatchObject({ code: 'candidate-patch-scope-violation' });

    const secretPatch = patch(' api_key=sk-secret-value-123456');
    await expect(
      writeOptimizationCandidateArtifacts(
        { plan: plan(), candidate: candidate(secretPatch), patchText: secretPatch },
        { repositoryRoot: work.root, outputRoot: work.outputRoot, artifactPathPrefix: 'artifacts' },
      ),
    ).rejects.toThrow('credential');

    const holdoutText = 'unseen-holdout-input';
    const leakedPatch = patch(` ${holdoutText}`);
    await expect(
      writeOptimizationCandidateArtifacts(
        { plan: plan(), candidate: candidate(leakedPatch), patchText: leakedPatch },
        {
          repositoryRoot: work.root,
          outputRoot: work.outputRoot,
          artifactPathPrefix: 'artifacts',
          forbiddenTexts: [holdoutText],
        },
      ),
    ).rejects.toThrow('optimizer-hidden');
  });
});

describe('optimization approval boundary', () => {
  it('persists an explicit approval and returns only a normal OpenSpec handoff', async () => {
    const work = await workspace();
    const written = await writeOptimizationApprovalRecord(
      approval(),
      { plan: plan(), candidate: candidate() },
      { outputRoot: work.outputRoot },
    );
    expect(JSON.parse(await fs.readFile(written.approval, 'utf8'))).toEqual(approval());
    expect(
      createOpenSpecApplicationHandoff({
        plan: plan(),
        candidate: candidate(),
        approval: approval(),
      }),
    ).toEqual({
      schema: 'neko.agent-eval.openspec-application-handoff.v1',
      kind: 'openspec-apply-required',
      planId: plan().id,
      candidateId: candidate().id,
      approvalId: approval().id,
      targetFile: TARGET,
      patchPath: candidate().patchPath,
      baseFingerprint: HASH_A,
      candidateFingerprint: HASH_B,
      canonicalMutationPerformed: false,
      commitPerformed: false,
    });
  });

  it('stops application for rejection or stale fingerprint', () => {
    expect(() =>
      createOpenSpecApplicationHandoff({
        plan: plan(),
        candidate: candidate(),
        approval: approval({ decision: 'reject' }),
      }),
    ).toThrow('not approved');
    expect(() =>
      createOpenSpecApplicationHandoff({
        plan: plan(),
        candidate: candidate(),
        approval: approval({ candidateFingerprint: `sha256:${'c'.repeat(64)}` }),
      }),
    ).toThrow('candidate fingerprint changed');
  });
});

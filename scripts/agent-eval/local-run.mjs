#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { execFile as nodeExecFile } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  isAgentEvaluationRelevantPath,
  selectEvaluationCoverage,
} from './authoring/change-selector.mjs';
import { runCaseRepeated } from './runner/run-case.mjs';
import { aggregateMatrixShards, createMatrixPlan, executeMatrixPlan } from './matrix/runtime.mjs';
import {
  classifyEvaluationError,
  classifyEvaluationOutcomes,
  evaluationExitCode,
} from './runner/outcomes.mjs';
import { withCanonicalUserConfiguration } from './runner/user-configuration.mjs';
import { discoverSuites, selectSuiteCases } from './suites/discovery.mjs';

const execFile = promisify(nodeExecFile);
const scriptPath = fileURLToPath(import.meta.url);
const DEFAULT_REPORT_ROOT = 'reports/agent-eval';
const MATRIX_SUITES = Object.freeze([
  'agent-runtime.model-binding',
  'agent-runtime.prompt-composition',
  'agent-runtime.skill-runtime',
  'agent-runtime.workflow-controller',
  'agent-runtime.media-tool-routing',
  'agent-runtime.creative-media-workflow',
  'skill.storyboard',
  'skill.skill-creator',
  'skill.image',
  'skill.video',
  'skill.media-quality-review',
]);
export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const args = parseArgs(argv);
  const reportRoot = resolve(args.reportRoot ?? DEFAULT_REPORT_ROOT);
  let summary;
  try {
    const suites = await discoverSuites();
    const suiteIds = await selectSuiteIds(args, suites);
    const selections = suiteIds.flatMap((suiteId) =>
      selectSuiteCases(suites, { suiteId, ...(args.caseId ? { caseId: args.caseId } : {}) }).filter(
        (selection) => selection.scenario.visibility === 'public',
      ),
    );
    if (args.mode === 'matrix') {
      const selected = filterMatrixEvidenceLane(selections, args);
      const plan = await createMatrixPlan(selected.selections, {
        matrixId: args.matrixId ?? `local-${Date.now().toString(36)}`,
        strategy: 'matrix',
        evidenceLevel: args.evidenceLevel ?? 'hidden-desktop',
        repetitions: args.repetitions,
        shard: { index: args.shardIndex ?? 0, count: args.shardCount ?? 1 },
        build: {
          id: 'local-packaged-desktop',
          kind: 'packaged',
          executablePath: args.desktopExecutable,
          fingerprint: args.desktopFingerprint,
        },
        limits: {
          capacitySource: args.capacitySource ?? 'conservative-local-defaults',
          desktop: args.desktopWorkers ?? 2,
          provider: args.providerWorkers ?? 2,
        },
      });
      const shard = await executeMatrixPlan(plan, {
        caseOptions: { env: withCanonicalUserConfiguration(io.env), outputRoot: reportRoot },
      });
      const aggregate = plan.shard.count === 1 ? aggregateMatrixShards(plan, [shard]) : undefined;
      summary = {
        schema: 'neko.agent-eval.local-run-summary',
        mode: 'matrix',
        outcome: aggregate?.outcome ?? shard.outcome,
        repetitions: args.repetitions,
        selectedSuiteIds: suiteIds,
        matrix: {
          matrixId: plan.matrixId,
          policyDigest: plan.policyDigest,
          shard: plan.shard,
          build: plan.build,
          excludedVisibleCases: selected.excludedVisibleCases,
          result: shard,
          ...(aggregate ? { aggregate } : {}),
        },
        runs: shard.samples.map(projectMatrixSample),
      };
      await writeSummary(reportRoot, summary);
      io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return exitCode(summary.outcome);
    }
    const runs = [];
    for (const [index, selection] of selections.entries()) {
      const repeatedSelection = {
        ...selection,
        scenario: {
          ...selection.scenario,
          budget: { ...selection.scenario.budget, repetitions: args.repetitions },
        },
      };
      const run = await runCaseRepeated(repeatedSelection, {
        env: withCanonicalUserConfiguration(io.env),
        cwd: io.cwd(),
        outputRoot: reportRoot,
        runId: `${args.mode}-${index + 1}-${Date.now().toString(36)}`,
      });
      runs.push({
        suiteId: selection.suite.id,
        caseId: selection.scenario.id,
        outcome: run.outcome,
        aggregate: run.aggregate.aggregateLocation,
        samples: run.samples.map((sample) => ({
          runId: sample.result.runId,
          outcome: sample.outcome,
          reportLocations: sample.result.reportLocations,
        })),
      });
    }
    const outcome = classifyRuns(runs);
    summary = {
      schema: 'neko.agent-eval.local-run-summary',
      mode: args.mode,
      outcome,
      repetitions: args.repetitions,
      selectedSuiteIds: suiteIds,
      runs,
    };
    await writeSummary(reportRoot, summary);
    io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return exitCode(outcome);
  } catch (error) {
    const outcome = classifyEvaluationError(error, 'configuration-invalid');
    summary = {
      schema: 'neko.agent-eval.local-run-summary',
      mode: args.mode ?? 'unknown',
      outcome,
      diagnostic: error instanceof Error ? error.message : String(error),
      runs: [],
    };
    await writeSummary(reportRoot, summary);
    io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return exitCode(outcome);
  }
}

export function parseArgs(argv) {
  const args = { repetitions: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === '--mode') args.mode = requireValue(name, value);
    else if (name === '--suite') args.suiteId = requireValue(name, value);
    else if (name === '--case') args.caseId = requireValue(name, value);
    else if (name === '--base-sha') args.baseSha = requireValue(name, value);
    else if (name === '--head-sha') args.headSha = requireValue(name, value);
    else if (name === '--report-root') args.reportRoot = requireValue(name, value);
    else if (name === '--matrix-id') args.matrixId = requireValue(name, value);
    else if (name === '--evidence-level') args.evidenceLevel = requireValue(name, value);
    else if (name === '--desktop-executable') args.desktopExecutable = requireValue(name, value);
    else if (name === '--desktop-fingerprint') args.desktopFingerprint = requireValue(name, value);
    else if (name === '--capacity-source') args.capacitySource = requireValue(name, value);
    else if (name === '--shard-index') args.shardIndex = readBoundedInteger(name, value, 0, 1023);
    else if (name === '--shard-count') args.shardCount = readBoundedInteger(name, value, 1, 1024);
    else if (name === '--desktop-workers')
      args.desktopWorkers = readBoundedInteger(name, value, 1, 32);
    else if (name === '--provider-workers')
      args.providerWorkers = readBoundedInteger(name, value, 1, 32);
    else if (name === '--repetitions') {
      args.repetitions = Number.parseInt(requireValue(name, value), 10);
      if (!Number.isInteger(args.repetitions) || args.repetitions < 1 || args.repetitions > 20) {
        throw new Error('--repetitions must be an integer in 1..20');
      }
    } else throw new Error(`unknown local Evaluation option: ${name}`);
    index += 1;
  }
  if (args.mode !== 'focused' && args.mode !== 'matrix') {
    throw new Error('--mode must be focused or matrix');
  }
  if (
    args.evidenceLevel !== undefined &&
    !['hidden-desktop', 'visible-desktop'].includes(args.evidenceLevel)
  ) {
    throw new Error('--evidence-level must be hidden-desktop or visible-desktop');
  }
  if (args.mode === 'matrix' && (!args.desktopExecutable || !args.desktopFingerprint)) {
    throw new Error('--mode matrix requires --desktop-executable and --desktop-fingerprint');
  }
  const shardCount = args.shardCount ?? 1;
  const shardIndex = args.shardIndex ?? 0;
  if (shardIndex >= shardCount) throw new Error('--shard-index must be less than --shard-count');
  return args;
}

export async function selectSuiteIds(args, suites, options = {}) {
  const available = new Set(suites.map((entry) => entry.suite.id));
  if (args.suiteId) {
    if (!available.has(args.suiteId))
      throw new Error(`selected suite does not exist: ${args.suiteId}`);
    return [args.suiteId];
  }
  if (args.mode === 'matrix') return MATRIX_SUITES.filter((id) => available.has(id));
  if (!args.baseSha || !args.headSha) {
    throw new Error('focused selection requires --suite or both --base-sha and --head-sha');
  }
  const changedPaths =
    options.changedPaths ?? (await readChangedPaths(args.baseSha, args.headSha, options.execFile));
  const relevant = changedPaths.filter(isAgentEvaluationRelevantPath);
  const selections = relevant.length > 0 ? selectEvaluationCoverage(relevant) : [];
  const selectedSuiteIds = selections.flatMap((item) => item.suiteIds ?? [item.suiteId]);
  const suiteIds = [...new Set(selectedSuiteIds)].filter((id) => available.has(id));
  const missing = selections
    .flatMap((item) => item.suiteIds ?? [item.suiteId])
    .filter((id) => id !== 'agent-runtime.evaluation-platform' && !available.has(id));
  if (missing.length > 0) {
    throw new Error(
      `changed behavior references missing suite(s): ${[...new Set(missing)].join(', ')}`,
    );
  }
  return suiteIds;
}

async function readChangedPaths(baseSha, headSha, injectedExecFile = execFile) {
  const { stdout } = await injectedExecFile('git', ['diff', '--name-only', baseSha, headSha]);
  return stdout
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function classifyRuns(runs) {
  return classifyEvaluationOutcomes(runs.map((run) => run.outcome));
}

function exitCode(outcome) {
  return evaluationExitCode(outcome);
}

async function writeSummary(reportRoot, summary) {
  await fs.mkdir(reportRoot, { recursive: true });
  await fs.writeFile(
    resolve(reportRoot, 'local-run-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

function requireValue(name, value) {
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function readBoundedInteger(name, value, minimum, maximum) {
  const parsed = Number.parseInt(requireValue(name, value), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  }
  return parsed;
}

function filterMatrixEvidenceLane(selections, args) {
  const evidenceLevel = args.evidenceLevel ?? 'hidden-desktop';
  if (evidenceLevel === 'visible-desktop') {
    return { selections, excludedVisibleCases: [] };
  }
  const visible = selections.filter(
    (selection) => selection.scenario.execution?.evidenceLevel === 'visible-desktop',
  );
  if (args.caseId && visible.length > 0) {
    throw new Error(`selected case requires visible Desktop evidence: ${args.caseId}`);
  }
  return {
    selections: selections.filter(
      (selection) => selection.scenario.execution?.evidenceLevel !== 'visible-desktop',
    ),
    excludedVisibleCases: visible.map(
      (selection) => `${selection.suite.id}/${selection.scenario.id}`,
    ),
  };
}

function projectMatrixSample(sample) {
  return {
    suiteId: sample.identity.suiteId,
    caseId: sample.identity.caseId,
    sampleId: sample.sampleId,
    outcome: sample.outcome,
    attempts: sample.attempts,
    ...(sample.run?.result?.reportLocations
      ? { reportLocations: sample.run.result.reportLocations }
      : {}),
    ...(sample.residualCoverage ? { residualCoverage: sample.residualCoverage } : {}),
  };
}

function defaultIo() {
  return {
    env: process.env,
    stdout: process.stdout,
    cwd: () => process.cwd(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await main();
}

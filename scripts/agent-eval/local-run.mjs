#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { execFile as nodeExecFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  isAgentEvaluationRelevantPath,
  selectEvaluationCoverage,
} from './authoring/change-selector.mjs';
import { runV2Case } from './runner/run-v2-case.mjs';
import { discoverSuites, selectSuiteCases } from './suites/discovery.mjs';

const execFile = promisify(nodeExecFile);
const scriptPath = fileURLToPath(import.meta.url);
const DEFAULT_REPORT_ROOT = 'reports/agent-eval';
const MATRIX_SUITES = Object.freeze([
  'agent-runtime.single-message-tui',
  'agent-runtime.model-binding',
  'agent-runtime.prompt-composition',
  'agent-runtime.skill-runtime',
  'agent-runtime.workflow-controller',
  'agent-runtime.perception-routing',
  'agent-runtime.creative-media-workflow',
  'skill.storyboard',
  'skill.skill-creator',
  'skill.image',
  'skill.video',
  'skill.media-quality-review',
]);
const CREDENTIAL_ENV_NAMES = Object.freeze([
  'NEKO_API_KEY',
  'LLM_API_KEY',
  'NEKO_GATEWAY_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'NEWAPI_API_KEY',
]);

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const args = parseArgs(argv);
  const reportRoot = resolve(args.reportRoot ?? DEFAULT_REPORT_ROOT);
  let summary;
  try {
    const suites = await discoverSuites();
    const suiteIds = await selectSuiteIds(args, suites);
    const blocker = await readInfrastructureBlocker(io.env);
    if (blocker) {
      summary = {
        schema: 'neko.agent-eval.local-run-summary.v2',
        mode: args.mode,
        outcome: 'infrastructure-blocked',
        selectedSuiteIds: suiteIds,
        diagnostic: blocker,
        runs: [],
      };
      await writeSummary(reportRoot, summary);
      io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return 2;
    }
    const selections = suiteIds.flatMap((suiteId) =>
      selectSuiteCases(suites, { suiteId }).filter(
        (selection) => selection.scenario.visibility === 'public',
      ),
    );
    const runs = [];
    for (const [index, selection] of selections.entries()) {
      const repeatedSelection = {
        ...selection,
        scenario: {
          ...selection.scenario,
          budget: { ...selection.scenario.budget, repetitions: args.repetitions },
        },
      };
      const run = await runV2Case(repeatedSelection, {
        env: io.env,
        cwd: io.cwd(),
        outputRoot: reportRoot,
        runId: `${args.mode}-${index + 1}-${Date.now().toString(36)}`,
      });
      runs.push({
        suiteId: selection.suite.id,
        caseId: selection.scenario.id,
        outcome: run.outcome,
        reportLocations: run.result.reportLocations,
      });
    }
    const outcome = classifyRuns(runs);
    summary = {
      schema: 'neko.agent-eval.local-run-summary.v2',
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
    summary = {
      schema: 'neko.agent-eval.local-run-summary.v2',
      mode: args.mode ?? 'unknown',
      outcome: 'configuration-invalid',
      diagnostic: error instanceof Error ? error.message : String(error),
      runs: [],
    };
    await writeSummary(reportRoot, summary);
    io.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 3;
  }
}

export function parseArgs(argv) {
  const args = { repetitions: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === '--mode') args.mode = requireValue(name, value);
    else if (name === '--suite') args.suiteId = requireValue(name, value);
    else if (name === '--base-sha') args.baseSha = requireValue(name, value);
    else if (name === '--head-sha') args.headSha = requireValue(name, value);
    else if (name === '--report-root') args.reportRoot = requireValue(name, value);
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

async function readInfrastructureBlocker(env) {
  if (!CREDENTIAL_ENV_NAMES.some((name) => typeof env[name] === 'string' && env[name].length > 0)) {
    return 'No local Agent provider credential environment variable is available.';
  }
  const configPath = resolve(os.homedir(), '.neko', 'config.toml');
  try {
    const stat = await fs.stat(configPath);
    if (!stat.isFile()) return `Local Agent configuration is not a file: ${configPath}`;
  } catch (error) {
    if (error?.code === 'ENOENT') return `Local Agent configuration is missing: ${configPath}`;
    throw error;
  }
  return undefined;
}

function classifyRuns(runs) {
  if (runs.some((run) => run.outcome === 'configuration-invalid')) return 'configuration-invalid';
  if (runs.some((run) => run.outcome === 'infrastructure-fail')) return 'infrastructure-fail';
  if (runs.some((run) => run.outcome === 'case-fail')) return 'case-fail';
  if (runs.some((run) => run.outcome === 'non-comparable')) return 'non-comparable';
  return 'pass';
}

function exitCode(outcome) {
  if (outcome === 'pass') return 0;
  if (outcome === 'configuration-invalid') return 3;
  if (outcome === 'infrastructure-fail' || outcome === 'infrastructure-blocked') return 2;
  return 1;
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

function defaultIo() {
  return { env: process.env, stdout: process.stdout, cwd: () => process.cwd() };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await main();
}
